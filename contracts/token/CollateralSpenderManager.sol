// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Collateral.sol";

/**
 * @title CollateralSpenderManager
 * @notice This contract handles the collateral spender for USDO
 */
abstract contract CollateralSpenderManager is Collateral, ReentrancyGuard {
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
    address internal approvedCollateralSpender;

    /// @notice the proposed new spender
    address public proposedSpender;

    /// @notice the last proposal time
    uint256 public proposalTime;

    constructor(
        address admin,
        MintRedeemManagerTypes.StableCoin memory usdc_,
        MintRedeemManagerTypes.StableCoin memory usdt_
    ) Collateral(admin, usdc_, usdt_) {}

    /// @notice View the spender
    /// @return The active spender
    function getSpender() public view returns (address) {
        return approvedCollateralSpender;
    }

    /// @notice Propose a new spender
    /// @dev Can not be zero address
    /// @param spender The proposed new spender
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
    function acceptProposedCollateralSpender() external nonReentrant {
        if (msg.sender != proposedSpender) {
            revert CollateralSpenderManagerOperatioNotAllowed();
        }
        if (
            approvedCollateralSpender != address(0) &&
            proposalTime + PROPOSAL_TIME_INTERVAL > block.timestamp
        ) {
            revert CollateralSpenderManagerIntervalNotRespected();
        }
        address oldSpender = approvedCollateralSpender;
        approvedCollateralSpender = proposedSpender;
        //remove allowance of old spender
        if (oldSpender != address(0)) {
            IERC20(usdc.addr).forceApprove(oldSpender, 0);
            IERC20(usdt.addr).forceApprove(oldSpender, 0);
        }
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
