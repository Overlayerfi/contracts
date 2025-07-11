// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "../../token/types/MintRedeemManagerTypes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOverlayerWrap is IERC20 {
    function acceptProposedCollateralSpender() external;
    function mint(MintRedeemManagerTypes.Order calldata order) external;
    function emergencyMode() external returns (bool);
}
