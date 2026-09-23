// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice aCollateral placeholder for O-GHO. It has no supply, so it cannot be minted or donated.
///         sGHO is a different token, so the audited OverlayerWrap rejects sGHO mint and redeem.
contract GhoExcludedCollateral is ERC20 {
    constructor() ERC20("GHO excluded collateral", "xGHO") {}
}
