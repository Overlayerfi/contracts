// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AaveHandlerDefs
 */
interface AaveHandlerDefs {
    error ZeroAddressException();

    error CantRenounceOwnership();

    error OperationNotAllowed();

    error InsufficientBalance();
}
