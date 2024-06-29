// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Collateral.sol";
import "hardhat/console.sol";

/**
 * @title CollateralSpenderManager
 * @notice This contract handles the collateral spender for USDO
 */
abstract contract CollateralSpenderManager is Collateral {
    using SafeERC20 for IERC20;

    error CollateralSpenderManagerInvalidAdminAddress();

    error CollateralSpenderManagerInvalidSpenderAddress();

    error CollateralSpenderManagerIntervalNotRespected();

    error CollateralSpenderManagerOperatioNotAllowed();

    /// @notice role enabling to transfer collateral to custody wallets
    bytes32 internal constant COLLATERAL_MANAGER_ROLE =
        keccak256("COLLATERAL_MANAGER_ROLE");

    /// @notice the time interval needed to changed a spender address
    uint256 public constant PROPOSAL_TIME_INTERVAL = 10 days;

    /// @notice the unique approved collateral spender
    address public approvedCollateralSpender;

    /// @notice the proposed new spender
    address public proposedSpender;

    /// @notice the last proposal time
    uint256 public proposalTime;

    constructor(
        address admin,
        MintRedeemManagerTypes.StableCoin memory _usdc,
        MintRedeemManagerTypes.StableCoin memory _usdt
    ) Collateral(admin, _usdc, _usdt) {}

    /// @notice Propose a new spender
    /// @dev Can not be zero address
    function proposeNewCollateralSpender(
        address spender
    ) external onlyRole(COLLATERAL_MANAGER_ROLE) {
        if (spender == address(0))
            revert CollateralSpenderManagerInvalidSpenderAddress();
        proposedSpender = spender;
        proposalTime = block.timestamp;
    }

    /// @notice The proposed spender accepts to be the spender
    /// @dev If it is the initial spender, the PROPOSAL_TIME_INTERVAL is not respected
    function acceptProposedCollateralSpender() external {
        if (msg.sender != proposedSpender) {
            revert CollateralSpenderManagerOperatioNotAllowed();
        }
        if (
            approvedCollateralSpender != address(0) &&
            proposalTime + PROPOSAL_TIME_INTERVAL > block.timestamp
        ) {
            revert CollateralSpenderManagerIntervalNotRespected();
        }
        //remove allowance of old spender
        if (approvedCollateralSpender != address(0)) {
            IERC20(usdc.addr).forceApprove(approvedCollateralSpender, 0);
            IERC20(usdt.addr).forceApprove(approvedCollateralSpender, 0);
        }
        approvedCollateralSpender = proposedSpender;
        //add allowance for new spender
        IERC20(usdc.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
        IERC20(usdt.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
    }
}
