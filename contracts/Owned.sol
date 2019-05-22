pragma solidity 0.5.0;

contract Owned
{
    address private owner;
    event LogOwnerChanged(address indexed oldOwner, address indexed newOwner);

    constructor () public
    {
        owner = msg.sender;
    }

    modifier isOwner
    {
        require(msg.sender == owner, "Owner permission required");
        _;
    }

    function getOwner() public view returns(address)
    {
        return owner;
    }

    function changeOwner(address newOwner) public
        isOwner
        returns (bool success)
    {
        require(newOwner != address(0x0), 'Invalid newOwner');
        require(newOwner != owner, 'Same owner');
        
        emit LogOwnerChanged(owner, newOwner);
        owner = newOwner;
        return true;
    }
}