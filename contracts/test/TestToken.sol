// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor(
        uint256 initialSupply,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    /**
     * @dev Mint new supply.
     * @param _amount the amount to be minted.
     * @return newSupply the new totalSupply.
     */
    function mint(uint256 _amount) external returns (uint256 newSupply) {
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
