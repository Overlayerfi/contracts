// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

interface IOverlayerWrapBackingDefs {
    error OverlayerWrapBackingZeroAddressException();

    error OverlayerWrapBackingCantRenounceOwnership();

    error OverlayerWrapBackingOperationNotAllowed();

    event OverlayerWrapSpenderAccepted();
}
