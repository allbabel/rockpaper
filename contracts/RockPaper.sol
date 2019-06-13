pragma solidity 0.5.0;
import "./Running.sol";
import "./SafeMath.sol";

contract RockPaper is Running
{
    using SafeMath for uint;
    mapping(address => uint) public winnings;
    mapping(bytes32 => Game) public games;
    uint constant DEADLINE_IN_SECONDS = 1 days;

    enum Guess {NONE, ROCK, PAPER, SCISSORS}
    Guess[3][3] rules =
    [
        [Guess.NONE, Guess.PAPER, Guess.ROCK],
        [Guess.PAPER, Guess.NONE, Guess.SCISSORS],
        [Guess.ROCK, Guess.SCISSORS, Guess.NONE]
    ];

    struct Game
    {
        address player1;
        address player2;
        uint wager;
        uint expires;
        Guess plainGuess2;
    }

    event LogGameCreated(   address indexed player1,
                            address indexed player2,
                            uint wager,
                            bytes32 gameId);

    event LogGameCompleted( address indexed player1,
                            address indexed player2,
                            uint wager,
                            bytes32 gameId,
                            Guess plainGuess2);

    event LogGameSettled(   address indexed player1,
                            address indexed player2,
                            address indexed winner,
                            uint wager,
                            bytes32 gameId,
                            Guess plainGuess2);

    event LogGameDrawn( address indexed player1,
                        address indexed player2);

    event LogGameCancelled( address indexed player1,
                            address indexed player2,
                            address indexed playerCancelled,
                            uint wager,
                            bytes32 gameId);

    event LogWinningsWithdrawn( address indexed player,
                                uint value);

    constructor()
        public
        Running(true)
    {

    }

    modifier onlyValidGuess(Guess guess)
    {
        require(guess > Guess.NONE && guess <= Guess.SCISSORS, 'Invalid guess');
        _;
    }

    // A player would need to pass the game id through to startGame()
    function createGameId(Guess plainGuess, bytes32 seed)
        public
        view
        onlyValidGuess(plainGuess)
        returns (bytes32)
    {
        require(isValidBytes32(seed), 'Invalid seed');

        return keccak256(abi.encodePacked(plainGuess, seed, address(this)));
    }

    // A player starts a game on the chain, they send their guess encoded using encodeGuess
    // They would send value, which is optional, this would create a game
    // msg.sender is set as player1, passes hashed guess, sets wager and player2
    // If the player has funds in the contract then they can be used
    function startGame(bytes32 gameId, address player2, uint wager)
        public
        payable
    {
        // Check parameters
        require(isValidBytes32(gameId), 'Invalid guess');
        require(isValidAddress(player2), 'We need player2');
        // Player2 cannot be Player1
        require(player2 != msg.sender, 'Player1 cannot be Player2');
        // Look up game from storage, if we have player1 set the game exists
        require(!isValidAddress(games[gameId].player1), 'Game already exists');
        // User sends no payment and has insufficient funds in their winnings slot
        winnings[msg.sender] = winnings[msg.sender].add(msg.value).sub(wager);
        // Create game
        games[gameId] = Game( { wager: wager,
                                player1: msg.sender,
                                player2: player2,
                                expires: now + DEADLINE_IN_SECONDS,
                                plainGuess2: Guess.NONE} );

        // Emit event of game created
        emit LogGameCreated(msg.sender, player2, wager, gameId);
    }

    // A second player would join a game, they send a guess which isn't encoded
    // They would also send value, which should match the wager, this would close the game
    function joinGame(bytes32 gameId, Guess plainGuess, uint wager)
        public
        payable
        onlyValidGuess(plainGuess)
    {
        // Check parameters
        require(isValidBytes32(gameId), 'Invalid game');

        Game storage g = games[gameId];
        // Only player2 can call this
        require(g.player2 == msg.sender, 'You need to be player2 to set the guess');
        // Check wager matches
        require(g.wager == wager, 'Wager does not match');
        // Is this game complete?
        require(g.plainGuess2 == Guess.NONE, 'Player2 already submitted their move for this game');

        // Store plain guess for player2
        g.plainGuess2 = plainGuess;
        // Reset timeout
        g.expires = now + DEADLINE_IN_SECONDS;

        // User sends no payment and has insufficient funds in their winnings slot
        winnings[msg.sender] = winnings[msg.sender].add(msg.value).sub(wager);

        // Emit event of game being completed and now ready to be settled by player1
        emit LogGameCompleted(g.player1, g.player2, g.wager, gameId, g.plainGuess2);
    }
    // The game owner now has to settle the game, in other words reveals their guess to the network
    // This is then checked with what they had guessed in creating the game
    // There is a danger they will never settle the game and lock the funds.  TODO
    function settleGame(bytes32 gameId, Guess plainGuess, bytes32 seed)
        public
        onlyValidGuess(plainGuess)
    {
        // Check parameters
        require(isValidBytes32(seed), 'Invalid seed');
        require(isValidBytes32(gameId), 'Invalid game');

        Game storage g = games[gameId];
        // Only player1 can settle the game
        require(msg.sender == g.player1, 'Player1 needed to settle');
        // Check if valid game that we can settle
        require(g.plainGuess2 != Guess.NONE, 'Player2 has not submitted their move for this game');
        // Check hashed guess
        require(gameId == createGameId(plainGuess, seed), 'Invalid guess');

        // Calculate winner
        address winner = determineWinner(g, plainGuess);

        if (isValidAddress(winner))
        {
            // Winner takes all
            winnings[winner] = winnings[winner].add(g.wager).add(g.wager);

            emit LogGameSettled(g.player1, g.player2, winner, g.wager, gameId, g.plainGuess2);
        }
        else
        {
            // return wager to player1 and player2
            winnings[g.player1] = winnings[g.player1].add(g.wager);
            winnings[g.player2] = winnings[g.player2].add(g.wager);

            emit LogGameDrawn(g.player1, g.player2);
        }

        // Clear out game except player1 to lock the hash being used again in createGame()
        g.wager = 0;
        g.player2 = address(0x0);
        g.plainGuess2 = Guess.NONE;
    }

    function cancelGame(bytes32 gameId)
        public
    {
        // Check parameters
        require(isValidBytes32(gameId), 'Invalid game');
        Game memory g = games[gameId];
        require(isValidAddress(g.player1), 'Game does not exist');
        require(g.expires < now, 'Game has not yet expired');
        // Player 1 can only cancel in pre join game state and player 2 after they have taken their turn
        address player = (g.plainGuess2 == Guess.NONE) ? g.player1 : g.player2;
        require(player == msg.sender, 'You have to be in the game to cancel it');

        // Player 1 can cancel if nothing from player 2
        if(player == g.player1)
        {
            // Game cancelled and funds sent back
            winnings[g.player1] = winnings[g.player1].add(g.wager);
            winnings[g.player2] = winnings[g.player2].add(g.wager);

            g.wager = 0;
            g.player2 = address(0x0);

            emit LogGameCancelled(g.player1, g.player2, msg.sender, g.wager, gameId);
        }
        else // player2
        {
            // All goes to player2
            winnings[g.player2] = winnings[g.player2].add(g.wager).add(g.wager);

            g.wager = 0;
            g.player2 = address(0x0);
            g.plainGuess2 = Guess.NONE;

            emit LogGameCancelled(g.player1, g.player2, msg.sender, g.wager, gameId);
        }
    }

    function withdrawWinnings()
        public
    {
        uint toWin = winnings[msg.sender];
        require(toWin > 0, 'No balance');
        winnings[msg.sender] = 0;

        emit LogWinningsWithdrawn(msg.sender, toWin);

        msg.sender.transfer(toWin);
    }

    function determineWinner(Game storage g, Guess guess)
        private
        view
        returns (address winner)
    {
        if (guess != g.plainGuess2)
        {
            if (rules[uint(guess) - 1][uint(g.plainGuess2) - 1] == Guess(guess))
            {
                return g.player1;
            }

            return g.player2;
        }

        // A draw
        return address(0x0);
    }

    function isValidAddress(address addr)
        private
        pure
        returns (bool)
    {
        return addr != address(0x0);
    }

    function isValidBytes32(bytes32 b)
        private
        pure
        returns (bool)
    {
        return b != "";
    }
}