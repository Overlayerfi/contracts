// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "../shared/SingleAdminAccessControl.sol";
import "./types/OverlayerWrapCoreTypes.sol";

/**
 * @title OverlayerWrapCollateral
 * @notice This contract handles the collateral definitions for OverlayerWrap
 */
abstract contract OverlayerWrapCollateral is SingleAdminAccessControl {
    error CollateralInvalidZeroAddress();

    error CollateralInvalidDecimals();

    /* --------------- STATE VARIABLES --------------- */

    /// @notice Supported assets
    OverlayerWrapCoreTypes.StableCoin public collateral;
    OverlayerWrapCoreTypes.StableCoin public aCollateral;

    function _initialize(
        address admin_,
        OverlayerWrapCoreTypes.StableCoin memory collateral_,
        OverlayerWrapCoreTypes.StableCoin memory aCollateral_
    ) internal {
        if (admin_ == address(0)) revert CollateralInvalidZeroAddress();
        if (collateral_.addr == address(0))
            revert CollateralInvalidZeroAddress();
        if (collateral_.decimals == 0) revert CollateralInvalidDecimals();
        if (aCollateral_.addr == address(0))
            revert CollateralInvalidZeroAddress();
        if (aCollateral_.decimals == 0) revert CollateralInvalidDecimals();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);

        collateral = collateral_;
        aCollateral = aCollateral_;
    }
}
