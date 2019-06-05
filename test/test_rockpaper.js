const truffleAssert = require('truffle-assertions');
const RockPaperContract = artifacts.require("./RockPaper.sol");
const { toBN, stringToHex, toWei } = web3.utils;

randomString = () => { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);}

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
        
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');
        
        assert.strictEqual(txObj1.logs[0].args.player1, player1);
        assert.strictEqual(txObj1.logs[0].args.player2, player2);        
        assert.strictEqual(txObj1.logs[0].args.wager.toString(), valueToSend);
        assert.strictEqual(txObj1.logs[0].args.gameId, gameId);
        
        var gameObj = await instance.games.call(gameId);

        assert.strictEqual(gameObj.player1, player1);
        assert.strictEqual(gameObj.player2, player2);
        assert.strictEqual(gameObj.wager.toString(), valueToSend);
        assert.strictEqual(gameObj.gameId, gameId);
        assert.strictEqual(gameObj.plainGuess2.toString(), "0");
    });

    it('Should fail creating a game if guess invalid', async function() {
        
        let fn = instance.startGame(stringToHex(''), player2, {from: player1, value: valueToSend});
        await truffleAssert.reverts(    fn, 
                                        'Invalid guess');
    });

    it('Should fail if game exists', async function() {
        
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});
        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');
        
        let fn = instance.startGame(gameId, player2, {from: player1, value: valueToSend});
        await truffleAssert.reverts(    fn, 
                                        'Game already exists');
    });

    it('Should join a previously created game and receive a event on it being accepted', async function() {
        
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        assert.strictEqual(txObj2.logs[0].args.player1, player1);
        assert.strictEqual(txObj2.logs[0].args.player2, player2);
        assert.strictEqual(txObj2.logs[0].args.wager.toString(), valueToSend);
        assert.strictEqual(txObj2.logs[0].args.gameId, gameId);
        assert.strictEqual(txObj2.logs[0].args.plainGuess2.toString(), String(Guess.PAPER));
    });

    it('Should settle game and send funds to the winner', async function() {

        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));

        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId, Guess.PAPER, {from: player2, value: valueToSend});
        
        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var txObj3 = await instance.settleGame(gameId, Guess.ROCK, stringToHex(secret), {from: player1});

        // We expect player 2 to win with PAPER
        assert.strictEqual(txObj3.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj3.logs[0].event, 'LogGameSettled');

        assert.strictEqual(txObj3.logs[0].args.player1, player1);
        assert.strictEqual(txObj3.logs[0].args.player2, player2);
        assert.strictEqual(txObj3.logs[0].args.winner, player2);
        assert.strictEqual(txObj3.logs[0].args.wager.toString(), valueToSend);
        assert.strictEqual(txObj3.logs[0].args.gameId, gameId);
        assert.strictEqual(txObj3.logs[0].args.plainGuess2.toString(), String(Guess.PAPER));

        var player2Winnings = await instance.winnings.call(player2);

        assert.strictEqual(player2Winnings.toString(), toBN(valueToSend).add(toBN(valueToSend)).toString());
        
        // We should have cleared the game, except player1 so th hash can't be reused
        var game = await instance.games.call(gameId);
        assert.notStrictEqual(game.player1, "0x0000000000000000000000000000000000000000");
    });

    it('Should be unable to reuse the same hash twice', async function() {
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var txObj3 = await instance.settleGame(gameId, Guess.ROCK, stringToHex(secret), {from: player1});

        // We expect player 2 to win with PAPER
        assert.strictEqual(txObj3.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj3.logs[0].event, 'LogGameSettled');

        let fn = instance.startGame(gameId, player2, {from: player1, value: valueToSend});
        await truffleAssert.reverts(fn, 
                                    'Game already exists');
    });

    it('Should settle game if a draw send funds back', async function() {
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var txObj3 = await instance.settleGame(gameId, Guess.ROCK, stringToHex(secret), {from: player1});

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
        var game = await instance.games.call(gameId);
        assert.notStrictEqual(game.player1, "0x0000000000000000000000000000000000000000");
    });

    it('Should after game be able to withdraw funds', async function() {

        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        let player2Balance = await web3.eth.getBalance(player2);

        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        let contractBalance = await web3.eth.getBalance(instance.address);
        assert.strictEqual(contractBalance, toBN(valueToSend).add(toBN(valueToSend)).toString());
            
        let gasUsedToJoin = txObj2.receipt.gasUsed;
        let txHashToJoin = await web3.eth.getTransaction(txObj2.receipt.transactionHash);
        let txFeeToJoin = toBN(txHashToJoin.gasPrice * gasUsedToJoin);

        var txObj3 = await instance.settleGame(gameId, Guess.ROCK, stringToHex(secret), {from: player1});

        // We expect player 2 to win with PAPER
        assert.strictEqual(txObj3.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj3.logs[0].event, 'LogGameSettled');
        assert.strictEqual(txObj3.logs[0].args.player2, player2);
        assert.strictEqual(txObj3.logs[0].args.winner, player2);
        assert.strictEqual(txObj3.logs[0].args.wager.toString(), valueToSend);
        assert.strictEqual(txObj3.logs[0].args.gameId, gameId);
        assert.strictEqual(txObj3.logs[0].args.plainGuess2.toString(), String(Guess.PAPER));

        var player2Winnings = await instance.winnings.call(player2);
        assert.strictEqual(player2Winnings.toString(), toBN(valueToSend).add(toBN(valueToSend)).toString());
        
        var txObj4 = await instance.withdrawWinnings({from: player2});

        assert.strictEqual(txObj4.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj4.logs[0].event, 'LogWinningsWithdrawn');
        assert.strictEqual(txObj4.logs[0].args.value.toString(), toBN(valueToSend).add(toBN(valueToSend)).toString());
        let gasUsedToWithdraw = txObj4.receipt.gasUsed;
        let txHashToWithdraw = await web3.eth.getTransaction(txObj4.receipt.transactionHash);
        let txFeeToWithdraw = toBN(txHashToWithdraw.gasPrice * gasUsedToWithdraw);

        // Check contract is cleared out
        contractBalance = await web3.eth.getBalance(instance.address);
        assert.strictEqual(contractBalance, "0");
        
        let player2NewBalance = await web3.eth.getBalance(player2);
        let expectedNewBalance = toBN(player2Balance).add(toBN(valueToSend)).sub(txFeeToJoin).sub(txFeeToWithdraw);
        assert.strictEqual(player2NewBalance, expectedNewBalance.toString());
    });

    it('Should revert if no balance', async function() {
        let fn = instance.withdrawWinnings({from: player1});
        await truffleAssert.reverts(    fn, 
                                        'No balance');    
    });

    it('Should revert if settle game is called on an incomplete game', async function() {
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        let fn = instance.settleGame(gameId, Guess.ROCK, stringToHex(secret), {from: player1});
        await truffleAssert.reverts(    fn, 
                                        'Not a valid game');
    });

    it('Should revert if settle game is called by a stranger', async function() {
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var fn = instance.settleGame(gameId, Guess.ROCK, stringToHex(secret), {from: stranger});

        await truffleAssert.reverts(    fn, 
                                        'Player1 needed to settle');
    });

    it('Should revert if seed is wrong', async function() {
        let gameId = await instance.createGameId(Guess.ROCK, stringToHex(secret));
        
        var txObj1 = await instance.startGame(gameId, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var fn = instance.settleGame(gameId, Guess.ROCK, stringToHex('invalid'), {from: player1});

        await truffleAssert.reverts(    fn,
                                        'Invalid guess');
    });

    it('Should provide correct winner for all combinations', async function() {

        // Rock wins against scissors
        let s_1 = stringToHex(randomString());
        let gameId_1 = await instance.createGameId(Guess.ROCK, s_1);

        var txObj1 = await instance.startGame(gameId_1, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        var txObj2 = await instance.joinGame(gameId_1, Guess.SCISSORS, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        var txObj3 = await instance.settleGame(gameId_1, Guess.ROCK, s_1, {from: player1});

        assert.strictEqual(txObj3.logs[0].args.winner, player1);
        
        // Rock loses against paper
        let s_2 = stringToHex(randomString());
        let gameId_2 = await instance.createGameId(Guess.ROCK, s_2);
        
        txObj1 = await instance.startGame(gameId_2, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        txObj2 = await instance.joinGame(gameId_2, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        txObj3 = await instance.settleGame(gameId_2, Guess.ROCK, s_2, {from: player1});
        assert.strictEqual(txObj3.logs[0].args.winner, player2);

        // Paper wins against rock
        let s_3 = stringToHex(randomString());
        let gameId_3 = await instance.createGameId(Guess.PAPER, s_3);
        
        txObj1 = await instance.startGame(gameId_3, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        txObj2 = await instance.joinGame(gameId_3, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        txObj3 = await instance.settleGame(gameId_3, Guess.PAPER, s_3, {from: player1});
        assert.strictEqual(txObj3.logs[0].args.winner, player1);

        // Paper loses against scissors
        let s_4 = stringToHex(randomString());
        let gameId_4 = await instance.createGameId(Guess.PAPER, s_4);
        
        txObj1 = await instance.startGame(gameId_4, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        txObj2 = await instance.joinGame(gameId_4, Guess.SCISSORS, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        txObj3 = await instance.settleGame(gameId_4, Guess.PAPER, s_4, {from: player1});
        assert.strictEqual(txObj3.logs[0].args.winner, player2);
        
        // Scissors wins against paper
        let s_5 = stringToHex(randomString());
        let gameId_5 = await instance.createGameId(Guess.SCISSORS, s_5);
        
        txObj1 = await instance.startGame(gameId_5, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        txObj2 = await instance.joinGame(gameId_5, Guess.PAPER, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        txObj3 = await instance.settleGame(gameId_5, Guess.SCISSORS, s_5, {from: player1});
        
        assert.strictEqual(txObj3.logs[0].args.winner, player1);

        // Scissors loses against rock
        let s_6 = stringToHex(randomString());
        let gameId_6 = await instance.createGameId(Guess.SCISSORS, s_6);
        
        txObj1 = await instance.startGame(gameId_6, player2, {from: player1, value: valueToSend});

        assert.strictEqual(txObj1.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj1.logs[0].event, 'LogGameCreated');

        txObj2 = await instance.joinGame(gameId_6, Guess.ROCK, {from: player2, value: valueToSend});

        assert.strictEqual(txObj2.logs.length, 1, 'We should have an event');
        assert.strictEqual(txObj2.logs[0].event, 'LogGameCompleted');

        txObj3 = await instance.settleGame(gameId_6, Guess.SCISSORS, s_6, {from: player1});
        
        assert.strictEqual(txObj3.logs[0].args.winner, player2);
    });
});