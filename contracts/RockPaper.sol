pragma solidity 0.5.0;
import "./Running.sol";
import "./SafeMath.sol";

pragma solidity 0.5.0;

contract RockPaper is Running
{
    using SafeMath for uint256;
    mapping(address => uint) public winnings;
    mapping(address => Game) public games;

    enum Guess {NONE, ROCK, PAPER, SCISSORS}
    Guess[3][3] matrix =
    [
        [Guess.NONE, Guess.PAPER, Guess.ROCK],
        [Guess.PAPER, Guess.NONE, Guess.SCISSORS],
        [Guess.ROCK, Guess.SCISSORS, Guess.NONE]
    ];

    struct Game
    {
        uint wager;
        address player1;
        bytes32 guess1;
        address player2;
        uint8 guess2;
    }

    event LogGameCreated(address indexed player1, uint wager, bytes32 guess1);
    event LogGameCompleted(address indexed player1, address indexed player2, uint wager, bytes32 guess1, uint8 guess2);
    event LogGameSettled(address indexed player1, address indexed player2, address indexed winner, uint wager, bytes32 guess1, uint8 guess2);

    constructor()
        public
        Running(true)
    {

    }

    // A player would need to pass this through to createGame()
    function encodeGuess(uint8 guess, bytes32 seed)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(Guess(guess), seed));
    }

    // A player creates a game, they send their guess encoded using encodeGuess
    // They would send value, which is optional, this would create a game
    function createGame(bytes32 guess)
        public
        payable
    {
        require(games[msg.sender].player1 == address(0x0), 'Game already exists');
        require(uint(guess) > 0, 'Invalid guess');

        games[msg.sender] = Game( { wager: msg.value,
                                    player1: msg.sender,
                                    guess1: guess,
                                    player2: address(0x0),
                                    guess2: 0} );

        emit LogGameCreated(msg.sender, msg.value, guess);
    }

    // A second player would join a game, the send a guess which isn't encoded
    // They would also send value, which is optional, this would close the game
    function joinGame(address game, uint8 guess)
        public
        payable
    {
        Game storage g = games[game];
        require(g.player1 != address(0x0), "Game doesn't exists");
        require(guess > uint8(Guess.NONE) && guess <= uint8(Guess.SCISSORS), 'Bad guess');

        g.player2 = msg.sender;
        g.guess2 = guess;

        emit LogGameCompleted(g.player1, g.player2, g.wager, g.guess1, g.guess2);
    }

    // The game owner now has to settle the game, in other words reveals their guess to the network
    // This is then checked with what they had guessed in creating the game
    // There is a danger they will never settle the game and lock the funds.  TODO
    function settleGame(uint8 guess, bytes32 seed)
        public
    {
        Game storage g = games[msg.sender];
        require(validGame(g), 'Not a valid game');
        require(g.player1 == msg.sender, 'Not your game');
        require(uint(seed) != 0, 'Invalid seed');
        require(g.guess1 == encodeGuess(guess, seed), 'Invalid guess');

        address winner = determineWinner(g, guess);
        winnings[winner] = winnings[winner].add(g.wager);
        delete games[msg.sender];

        emit LogGameSettled(g.player1, g.player2, winner, g.wager, g.guess1, g.guess2);
    }

    function determineWinner(Game storage g, uint8 guess)
        private
        view
        returns (address)
    {
        if (guess != g.guess2)
        {
            if (matrix[guess][g.guess2] == Guess(guess))
            {
                return g.player1;
            }

            return g.player2;
        }

        return address(0x0);
    }

    function validGame(Game storage g)
        private
        view
        returns (bool)
    {
        return  validAddress(g.player1) &&
                validAddress(g.player2) &&
                uint(g.guess1) > 0 &&
                g.guess2 > 0;
    }

    function validAddress(address addr)
        private
        pure
        returns (bool)
    {
        return addr != address(0x0);
    }
}