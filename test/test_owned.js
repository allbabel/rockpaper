const truffleAssert = require('truffle-assertions');
const OwnedContract = artifacts.require("./Owned.sol");

contract('Owned', function(accounts) {

    const[ownerAccount, firstAccount, secondAccount] = accounts;
    let instance;
    
    beforeEach('initialise contract', async function() {

        instance = await OwnedContract.new({from: ownerAccount});
    });

    it('contract should have an owner', async function() {

        const address = await instance.getOwner.call();

        assert.strictEqual(address, ownerAccount);
    });

    it('the owner should be able to change the owner', async function() {
        
        const txObj = await instance.changeOwner(firstAccount, {from: ownerAccount});
        
        assert.strictEqual(txObj.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj.logs[0].event, 'LogOwnerChanged');

        const address = await instance.getOwner.call();

        assert.strictEqual(address, firstAccount);
    });

    it('only the owner can change the owner', async function() {

        await truffleAssert.reverts(
            instance.changeOwner(firstAccount, {from: secondAccount}),
            'Owner permission required'
        );

    });
});