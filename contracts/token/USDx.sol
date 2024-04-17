// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import '@openzeppelin/contracts/access/Ownable2Step.sol';
import './interfaces/IUSDxDefs.sol';

/**
 * @title USDx
 * @notice USDx The starting point...
 */
contract USDx is Ownable2Step, ERC20Burnable, ERC20Permit, IUSDxDefs {
    address public minter;

    ///@notice The constructor
    ///@param admin The contract admin
    constructor(
        address admin
    ) Ownable(admin) ERC20('USDx', 'USDx') ERC20Permit('USDx') {
        if (admin == address(0)) revert ZeroAddressException();
    }

    ///@notice Set a new minter
    ///@param newMinter The new minter address
    function setMinter(address newMinter) external onlyOwner {
        emit MinterUpdated(newMinter, minter);
        minter = newMinter;
    }

    ///@notice Mint tokens
    ///@param to The recipient address
    ///@param amount The amount to be minted
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert OnlyMinter();
        _mint(to, amount);
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert CantRenounceOwnership();
    }
}
