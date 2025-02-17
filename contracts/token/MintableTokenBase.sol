// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title MintableTokenBase
 * @notice This token represent a mintable token by an allowed minter.
 */
contract MintableTokenBase is Ownable2Step, ERC20Burnable, ERC20Permit {
    error ZeroAddressException();

    error OnlyMinter();

    error CantRenounceOwnership();

    event MinterStateChanged(address indexed minter_, bool _event);

    /// @notice The allowed minter
    mapping(address => bool) public minter;

    ///@notice The constructor
    ///@param admin The contract admin
    ///@param name The token name
    ///@param symbol The token symbol
    constructor(
        address admin,
        string memory name,
        string memory symbol
    ) Ownable(admin) ERC20(name, symbol) ERC20Permit(name) {
        if (admin == address(0)) revert ZeroAddressException();
    }

    ///@notice Set a new minter
    ///@param minter_ The new minter address
    function setMinter(address minter_) external onlyOwner {
        minter[minter_] = true;
        emit MinterStateChanged(minter_, true);
    }

    ///@notice Set a new minter
    ///@param minter_ The new minter address
    function removeMinter(address minter_) external onlyOwner {
        minter[minter_] = false;
        emit MinterStateChanged(minter_, false);
    }

    ///@notice Mint tokens
    ///@param to The recipient address
    ///@param amount The amount to be minted
    function mint(address to, uint256 amount) external {
        if (!minter[msg.sender]) revert OnlyMinter();
        _mint(to, amount);
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert CantRenounceOwnership();
    }
}
