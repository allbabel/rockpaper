const truffleAssert = require('truffle-assertions');
const RockPaperContract = artifacts.require("./RockPaper.sol");
const { toBN, stringToHex, toWei } = web3.utils;

contract('RockPaper', function(accounts) {

    [contractOwner, player1, player2, stranger] = accounts;
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

    it('Should join a previously created game and receive a event on it being accepted', async function() {
        
        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(player1, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        assert.strictEqual(txObj2.logs[0].args.player1, player1);
        assert.strictEqual(txObj2.logs[0].args.player2, player2);
        assert.strictEqual(txObj2.logs[0].args.wager1.toString(), valueToSend);
        assert.strictEqual(txObj2.logs[0].args.wager2.toString(), valueToSend);
        assert.strictEqual(txObj2.logs[0].args.guess1, encodedGuess);
        assert.strictEqual(txObj2.logs[0].args.guess2.toString(), String(Guess.PAPER));
    });

    it('Should settle game and send funds to the winner', async function() {

        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(player1, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var txObj3 = await instance.settleGame(Guess.ROCK, stringToHex(secret), {from: player1});

        // We expect player 2 to win with PAPER
        assert.strictEqual(txObj3.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj3.logs[0].event, 'LogGameSettled');

        assert.strictEqual(txObj3.logs[0].args.player1, player1);
        assert.strictEqual(txObj3.logs[0].args.player2, player2);
        assert.strictEqual(txObj3.logs[0].args.winner, player2);
        assert.strictEqual(txObj3.logs[0].args.wager1.toString(), valueToSend);
        assert.strictEqual(txObj3.logs[0].args.wager2.toString(), valueToSend);
        assert.strictEqual(txObj3.logs[0].args.guess1, encodedGuess);
        assert.strictEqual(txObj3.logs[0].args.guess2.toString(), String(Guess.PAPER));

        var player2Winnings = await instance.winnings.call(player2);

        assert.strictEqual(player2Winnings.toString(), toBN(valueToSend).add(toBN(valueToSend)).toString());
        
        // We should have cleared the game
        var game = await instance.games.call(player1);
        assert.strictEqual(game.player1, "0x0000000000000000000000000000000000000000");
    });

    it('Should settle game if a draw send funds back', async function() {
        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(player1, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var txObj3 = await instance.settleGame(Guess.ROCK, stringToHex(secret), {from: player1});

        // We expect a draw
        assert.strictEqual(txObj3.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj3.logs[0].event, 'LogGameDrawn');

        assert.strictEqual(txObj3.logs[0].args.player1, player1);
        assert.strictEqual(txObj3.logs[0].args.player2, player2);

        var player1Winnings = await instance.winnings.call(player1);
        var player2Winnings = await instance.winnings.call(player2);

        assert.strictEqual(player1Winnings.toString(), toBN(valueToSend).toString());
        assert.strictEqual(player2Winnings.toString(), toBN(valueToSend).toString());
        
        // We should have cleared the game
        var game = await instance.games.call(player1);
        assert.strictEqual(game.player1, "0x0000000000000000000000000000000000000000");
    });

    it('Should after game be able to withdraw funds', async function() {

        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(player1, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var txObj3 = await instance.settleGame(Guess.ROCK, stringToHex(secret), {from: player1});

        // We expect player 2 to win with PAPER
        assert.strictEqual(txObj3.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj3.logs[0].event, 'LogGameSettled');

        var txObj4 = await instance.withdrawWinnings({from: player2});

        assert.strictEqual(txObj4.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj4.logs[0].event, 'LogWinningsWithdrawn');
    
        var contractBalance = await web3.eth.getBalance(instance.address);

        assert.strictEqual(contractBalance.toString(), "0");
    });

    it('Should revert if no balance', async function() {
        let fn = instance.withdrawWinnings({from: player1});
        await truffleAssert.reverts(    fn, 
                                        'No balance');    
    });

    it('Should revert if settle game is called on an incomplete game', async function() {
        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        let fn = instance.settleGame(Guess.ROCK, stringToHex(secret), {from: player1});
        await truffleAssert.reverts(    fn, 
                                        'Not a valid game');
    });

    it('Should revert if settle game is called by a stranger', async function() {
        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(player1, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var game = await instance.games.call(player1);

        var fn = instance.settleGame(Guess.ROCK, stringToHex(secret), {from: stranger});

        await truffleAssert.reverts(    fn, 
                                        'Not a valid game');
    });

    it('Should revert if seed is wrong', async function() {
        let encodedGuess = await instance.encodeGuess(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.createGame(encodedGuess, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(player1, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var fn = instance.settleGame(Guess.ROCK, stringToHex('invalid'), {from: player1});

        await truffleAssert.reverts(    fn, 
                                        'Invalid guess');
    });
});