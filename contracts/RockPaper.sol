pragma solidity 0.5.0;
import "./Running.sol";

contract RockPaper is Running
{
    mapping(address=>uint) public balances;
    
    enum RESULT {NONE, ROCK, PAPER, SCISSORS}

    struct Guess
    {
        uint wager;
        address user;
        uint guess;
    }

    Guess[2] public game;

    event LogDecision(uint g0, uint g1);
    event LogGuess(uint index, uint guess);

    uint number;

    constructor()
        public
        Running(true)
    {

    }

    function makeGuess(uint _guess) public payable
    {
        require(game[0].user != address(0x0) && game[1].user != address(0x0), 'Game in play');
        Guess memory guess = Guess(msg.value, msg.sender, _guess);

        if (game[0].user == address(0x0))
        {
            game[0] = guess;
            emit LogGuess(0, guess.guess);
        }
        else
        {
            game[1] = guess;
            
            emit LogGuess(1, guess.guess);

            uint g0 = game[0].guess ^ uint(game[0].user);
            uint g1 = game[1].guess ^ uint(game[1].user);

            emit LogDecision(g0, g1);
        }
    }

    function diff() public view returns (uint)
    {
        return uint(msg.sender) ^ (uint(msg.sender) + uint(RESULT.PAPER));
    }
}