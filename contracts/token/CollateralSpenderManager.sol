// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "../shared/SingleAdminAccessControl.sol";
import "hardhat/console.sol";

/**
 * @title CollateralSpenderManager
 * @notice This contract handles the collateral spender for USDO
 */
abstract contract CollateralSpenderManager is SingleAdminAccessControl {
    error InvalidAdminAddress();

    error InvalidSpenderAddress();

    error IntervalNotRespected();

    /// @notice role enabling to transfer collateral to custody wallets
    bytes32 internal constant COLLATERAL_MANAGER_ROLE =
        keccak256("COLLATERAL_MANAGER_ROLE");

    /// @notice the time interval needed to changed a spender address
    uint256 public constant PROPOSAL_TIME_INTERVAL = 14 days;

    /// @notice the unique approved collateral spender
    address public approvedCollateralSpender;

    /// @notice the proposed new spender
    address public proposedSpender;

    /// @notice the last proposal time
    uint256 public proposalTime;

    constructor(address admin) {
        if (admin == address(0)) revert InvalidAdminAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        if (msg.sender != admin) {
            _grantRole(DEFAULT_ADMIN_ROLE, admin);
        }
    }

    /// @notice Propose a new spender
    /// @dev Can not be zero address
    function proposeNewCollateralSpender(
        address spender
    ) external onlyRole(COLLATERAL_MANAGER_ROLE) {
        if (spender == address(0)) revert InvalidSpenderAddress();
        proposedSpender = spender;
        proposalTime = block.timestamp;
    }

    /// @notice Accept a new collateral spender
    /// @dev If it is the initial spender, the PROPOSAL_TIME_INTERVAL is not respected
    function acceptProposedCollateralSpender()
        external
        onlyRole(COLLATERAL_MANAGER_ROLE)
    {
        if (approvedCollateralSpender == address(0)) {
            approvedCollateralSpender = proposedSpender;
            return;
        }
        console.log(
            "ciro",
            proposalTime + PROPOSAL_TIME_INTERVAL,
            block.timestamp
        );
        if (proposalTime + PROPOSAL_TIME_INTERVAL > block.timestamp) {
            revert IntervalNotRespected();
        }
        approvedCollateralSpender = proposedSpender;
    }
}
