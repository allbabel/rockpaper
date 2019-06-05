const truffleAssert = require('truffle-assertions');
const RemittanceContract = artifacts.require("./Remittance.sol");
const { toBN, stringToHex, toWei } = web3.utils;

const timeTravel = function (time) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time], // 86400 is num seconds in day
        id: new Date().getTime()
      }, (err, result) => {
        if(err){ return reject(err) }
        return resolve(result)
      });
    })
}

contract('Remittance', function(accounts) {

    [contractOwner, depositOwner, recipient] = accounts;
    const password = 'password';
    
    const falsepassword = 'something';
    const timeout = 60 * 60 * 24;
    const depositFee = 100;

    let instance;
    const valueToSend = toWei('0.1', 'ether');
    let puzzle;
    
    beforeEach('initialise contract and hash', () => {

        return RemittanceContract.new(depositFee, {from: contractOwner})
            .then(_instance => {
                instance = _instance;

                return instance.createPuzzle.call(recipient, stringToHex(password));

            })
            .then(function(hash) {
                puzzle = hash;
            });
    });
    
    it('Running by default is true', () => {

        return instance.getState.call()
            .then(state => {
                assert.strictEqual(state.toString(), "1");
            });
    });

    it('Should emit on deposit', function() {
        return instance.deposit(puzzle, 
                                timeout,
                                {from:depositOwner, value:valueToSend})
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogDeposit');
                
                assert.strictEqual(txObj.logs[0].args.puzzle, puzzle);        
            });
    });

    it('Should be unable to deposit after a successful deposit using the same puzzle', function() {

        return instance.deposit(puzzle, 
                                timeout,
                                {from:depositOwner, value:valueToSend})
            .then(function(txObj) {
                
                truffleAssert.reverts(
                    instance.deposit(puzzle, 
                                    timeout,
                                    {from:depositOwner, value:valueToSend}), 
                    'Deposit is not empty'
                );
            });
    });

    it('Deposit should revert if no value', function() {

        return truffleAssert.reverts(
                instance.deposit(   puzzle, 
                                    timeout,
                                    {from:depositOwner, value:'0'}),
                'Need to deposit something');
    });

    it('Should be unable to withdraw deposit with invalid passwords', function() {

        return instance.deposit(    puzzle, 
                                    timeout,
                                    {from:depositOwner, value:valueToSend})
            .then(function(txObj) {
                
                truffleAssert.reverts(
                    instance.withdraw(  web3.utils.stringToHex(falsepassword),
                                        {from:recipient}),
                    'No balance available'
                );
            });
    });

    it('Should be unable to withdraw if not already deposited', function() {

        return truffleAssert.reverts(
            instance.withdraw(  web3.utils.stringToHex(password), 
                                {from:recipient}),
            'No balance available');
    });

    it('Should be able to withdraw deposit with valid passwords', function() {

        let originalBalance;
        let txFee;
        let gasUsed;
        return web3.eth.getBalance(recipient).
            then(function(balance) {
                originalBalance = toBN(balance);
                return instance.deposit(puzzle,
                                        timeout, 
                                        {from:depositOwner, value:valueToSend})        
            })
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogDeposit');

                return instance.withdraw(   web3.utils.stringToHex(password), 
                                            {from:recipient});
            })
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogTransfer');
                gasUsed = txObj.receipt.gasUsed;
                return web3.eth.getTransaction(txObj.receipt.transactionHash);
            })
            .then(function(tx) {
                
                txFee = toBN(tx.gasPrice * gasUsed);
                return web3.eth.getBalance(recipient);
            })
            .then(function(balance) {
                
                assert.strictEqual( originalBalance.add(toBN(valueToSend)).sub(txFee).sub(toBN(depositFee)).toString(), 
                                    toBN(balance).toString(),
                                    'New balance is not correct');
            });
    });

    it("Deposit owner shouldn't be able to withdraw deposit with valid passwords until expired", function() {

        return instance.deposit(    puzzle,
                                    timeout, 
                                    {from:depositOwner, value:valueToSend})        
            .then(function(txObj) {
                
                truffleAssert.reverts(
                    instance.remitterWithdraw(puzzle, {from:depositOwner}),
                    'Deposit is not expired');
            });
    });

    it("Should be able to withdraw after the deposit has expired in 28 days", function() {

        return instance.deposit(    puzzle,
                                    timeout, 
                                    {from:depositOwner, value:valueToSend})        
            .then(function() {
                
                return timeTravel(86400 * 28); 
            })
            .then(function() {

                return instance.remitterWithdraw(   puzzle, 
                                                    {from:depositOwner});
            })
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogTransfer');
            });
    });

    it('Contract should have a cut of the action', function() {

        return instance.setDepositFee('150', {from: contractOwner})
            .then(function() {
                
                return instance.depositFee();
            })
            .then(function(depositFee) {

                assert.strictEqual('150', depositFee.toString(), 'Deposit fee is not set');

                return instance.deposit(puzzle, 
                                        timeout,
                                        {from:depositOwner, value:valueToSend});
            })
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogDeposit');
                
                return instance.withdraw(   web3.utils.stringToHex(password), 
                                            {from:recipient});
            })
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogTransfer');
                
                return web3.eth.getBalance(instance.address);
            })
            .then(function(balance) {
                
                assert.strictEqual(balance, '150', 'The contract should have 100 Wei cut');
                
                return instance.withdrawDepositFees();
            })
            .then(function(txObj) {

                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogWithdraw');
            });
    });

    it('Should not be able to use the same puzzle twice', function() {

        return instance.deposit(puzzle, 
                                timeout,
                                {from:depositOwner, value:valueToSend})
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogDeposit');
                
                return instance.withdraw(   web3.utils.stringToHex(password), 
                                            {from:recipient});
            })
            .then(function(txObj) {
                
                assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
                assert.strictEqual(txObj.logs[0].event, 'LogTransfer');
                
                truffleAssert.reverts(  instance.deposit(   puzzle, 
                                                            timeout,
                                                            {from:depositOwner, value:valueToSend}),
                                        'Deposit is not empty');
            });
    });
});