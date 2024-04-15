// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./interfaces/IUSDxDefs.sol";

/**
 * @title USDx
 * @notice USDx The starting point...
 */
contract USDx is Ownable2Step, ERC20Burnable, ERC20Permit, IUSDxDefs {
  address public minter;

	///@notice The constructor
	///@param _admin The contract admin
  constructor(address _admin) Ownable(_admin) ERC20("USDe", "USDe") ERC20Permit("USDe") {
    if (_admin == address(0)) revert ZeroAddressException();
  }

	///@notice Set a new minter
	///@param _newMinter The new minter address
  function setMinter(address _newMinter) external onlyOwner {
    emit MinterUpdated(_newMinter, minter);
    minter = _newMinter;
  }

	///@notice Mint tokens
	///@param _to The recipient address
	///@param _amount The amount to be minted
  function mint(address _to, uint256 _amount) external {
    if (msg.sender != minter) revert OnlyMinter();
    _mint(_to, _amount);
  }

	///@notice Renounce contract ownership
	///@dev Reverts by design
  function renounceOwnership() public view override onlyOwner {
    revert CantRenounceOwnership();
  }
}