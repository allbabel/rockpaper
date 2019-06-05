pragma solidity 0.5.0;
import "./Running.sol";
import "./SafeMath.sol";

contract RockPaper is Running
{
    using SafeMath for uint;
    mapping(address => uint) public winnings;
    mapping(bytes32 => Game) public games;

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
        uint wager;
        address player2;
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

    function startGame(bytes32 gameId, address player2)
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

        // Create game
        games[gameId] = Game( { wager: msg.value,
                                    player1: msg.sender,
                                    player2: player2,
                                    plainGuess2: Guess.NONE} );

        // Emit event of game created
        emit LogGameCreated(msg.sender, player2, msg.value, gameId);
    }

    // A second player would join a game, they send a guess which isn't encoded
    // They would also send value, which should match the wager, this would close the game
    function joinGame(bytes32 gameId, Guess plainGuess)
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
        require(g.wager == msg.value, 'Wager does not match');
        // Is this game complete?
        require(!isValidGame(g), 'Game is complete');

        // Store plain guess for player2
        g.plainGuess2 = plainGuess;

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
        require(isValidGame(g), 'Not a valid game');
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

    function withdrawWinnings()
        public
    {
        uint toWin = winnings[msg.sender];
        require(toWin > 0, 'No balance');
        uint valueToSend = toWin;
        winnings[msg.sender] = 0;

        emit LogWinningsWithdrawn(msg.sender, valueToSend);

        msg.sender.transfer(valueToSend);
    }

    function determineWinner(Game storage g, Guess guess)
        private
        view
        returns (address)
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

    function isValidGame(Game storage g)
        private
        view
        returns (bool)
    {
        return  isValidAddress(g.player1) &&
                isValidAddress(g.player2) &&
                uint(g.plainGuess2) > 0;
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