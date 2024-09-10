// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

//import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../shared/SingleAdminAccessControl.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title Collateral
 * @notice This contract handles the collateral for USDO
 */
abstract contract Collateral is SingleAdminAccessControl {
    //using SafeERC20 for IERC20;

    error CollateralInvalidZeroAddress();

    error CollateralInvalidDecimals();

    /* --------------- STATE VARIABLES --------------- */

    /// @notice Supported assets
    MintRedeemManagerTypes.StableCoin public usdt;
    MintRedeemManagerTypes.StableCoin public usdc;

    constructor(
        address admin,
        MintRedeemManagerTypes.StableCoin memory usdc_,
        MintRedeemManagerTypes.StableCoin memory usdt_
    ) {
        if (admin == address(0)) revert CollateralInvalidZeroAddress();
        if (usdc_.addr == address(0)) revert CollateralInvalidZeroAddress();
        if (usdt_.addr == address(0)) revert CollateralInvalidZeroAddress();
        if (usdc_.decimals == 0) revert CollateralInvalidDecimals();
        if (usdt_.decimals == 0) revert CollateralInvalidDecimals();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        if (msg.sender != admin) {
            _grantRole(DEFAULT_ADMIN_ROLE, admin);
        }

        usdc = usdc_;
        usdt = usdt_;
    }
}
