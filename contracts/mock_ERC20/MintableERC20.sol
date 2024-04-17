// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MintableERC20 is ERC20, Ownable {
    /**
     * @dev Minter addresses.
     */
    mapping(address => bool) public minter;

    modifier onlyMinter() {
        require(
            (minter[msg.sender] && msg.sender != address(0)) ||
                msg.sender == owner(),
            'MintableERC20: NOT_ALLOWED'
        );
        _;
    }

    constructor(
        uint256 initialSupply,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    /**
     * @dev Set a new minter.
     * @param _minter The minter address.
     */
    function setMinter(address _minter) external onlyOwner {
        minter[_minter] = true;
    }

    /**
     * @dev Remove a minter.
     * @param _minter The minter address.
     */
    function removeMinter(address _minter) external onlyOwner {
        minter[_minter] = false;
    }

    /**
     * @dev Mint new supply.
     * @param _amount the amount to be minted.
     * @return newSupply the new totalSupply.
     */
    function mint(
        uint256 _amount
    ) external onlyMinter returns (uint256 newSupply) {
        if (_amount > 0) {
            _mint(msg.sender, _amount);
            newSupply = totalSupply();
        }
    }

    /**
     * @dev Burn supply.
     * @param _amount the amount to be minted.
     * @return newSupply the new totalSupply.
     */
    function burn(uint256 _amount) external returns (uint256 newSupply) {
        if (_amount > 0) {
            _burn(msg.sender, _amount);
            newSupply = totalSupply();
        }
    }
}
