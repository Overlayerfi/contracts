// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/**
 * @title IUSDOBackingDefs
 */
interface IUSDOBackingDefs {
    error USDOBackingZeroAddressException();

    error USDOBackingCantRenounceOwnership();

    error USDOBackingOperationNotAllowed();

    event USDOSpenderAccepted();
}
