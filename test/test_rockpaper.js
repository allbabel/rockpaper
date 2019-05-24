const truffleAssert = require('truffle-assertions');
const RockPaperContract = artifacts.require("./RockPaper.sol");
const { toBN, stringToHex, toWei } = web3.utils;

contract('RockPaper', function(accounts) {

    [contractOwner, player1, player2] = accounts;
    const secret = 'secret';
    const valueToSend = toWei('0.1', 'ether');
    const Guess = {
        NONE: 0,
        ROCK: 1,
        PAPER: 2,
        SCISSORS: 3
    }
    
    let instance;
    
    beforeEach('initialise contract', () => {

        return RockPaperContract.new({from: contractOwner})
            .then(_instance => {
                instance = _instance;
            });
    });

    it('Should create game', async function() {
        
        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');
        
        assert.strictEqual(txObj1.logs[0].args.player1, player1);
        assert.strictEqual(txObj1.logs[0].args.wager1.toString(), valueToSend);
        assert.strictEqual(txObj1.logs[0].args.guess1, encodedGuess);
        
        var gameObj = await instance.games.call(player1);

        assert.strictEqual(gameObj.player1, player1);
        assert.strictEqual(gameObj.wager1.toString(), valueToSend);
        assert.strictEqual(gameObj.guess1, encodedGuess);
        
    });

    it('Should fail creating a game if guess invalid', async function() {
        
        let fn = instance.createGame(stringToHex(''), {from: player1, value: valueToSend});
        await truffleAssert.reverts(    fn, 
                                        'Invalid guess');
    });

    it('Should fail if game exists', async function() {
        
        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});
        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');
        
        let fn = instance.createGame(encodedGuess, {from: player1, value: valueToSend});
        await truffleAssert.reverts(    fn, 
                                        'Game already exists');
    });
});