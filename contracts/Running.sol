pragma solidity 0.5.0;
import "./Owned.sol";

contract Running is Owned
{
    bool private running;

    event LogRunningChanged(bool oldRunning, bool newRunning);

    modifier whenRunning
    {
        require(running, "We have stopped");
        _;
    }

    modifier whenPaused
    {
        require(!running, "We are paused");
        _;
    }

    constructor(bool _running) public
    {
        running = _running;
    }

    function getRunning() public view returns(bool)
    {
        return running;
    }

    function pause() public
        whenRunning
    {
        setRunning(false);
    }

    function resume() public
        whenPaused
    {
        setRunning(true);
    }

    function setRunning(bool newRunning)
        public
        isOwner
    {
        emit LogRunningChanged(running, newRunning);
        running = newRunning;
    }

    function kill()
        public
        isOwner
        whenPaused
    {
        selfdestruct(msg.sender);
    }
}