// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./GovernanceTokenBase.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OvaReferral
 * @notice This token tracks the referral points.
 */
contract OvaReferral is GovernanceTokenBase, ReentrancyGuard {
    /// @notice Track the referral source for given address
    mapping(address => address) public referredFrom;

    /// @notice Track all the referred users for a given address
    mapping(address => address[]) public referredUsers;

    /// @notice Track all the generated referral points for given address
    mapping(address => uint256) public generatedPoints;

    /// @notice External entities who can control the points tracking
    mapping(address => bool) public allowedPointsTrackers;

    event Referral(address indexed source, address consumer);
    event AddTracker(address tracker);
    event RemoveTracker(address tracker);

    error OvaReferralAlreadyReferred();
    error OvaReferralZeroAddress();
    error OvaReferralNotAllowed();

    modifier onlyTracker() {
        if (!allowedPointsTrackers[msg.sender]) {
            revert OvaReferralNotAllowed();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin The contract admin
    constructor(address admin) GovernanceTokenBase(admin, "AOVA", "AOVA") {}

    /// @notice Create a new referral
    /// @param source The referral source
    /// @param consumer The referral consumer
    function consumeReferral(
        address source,
        address consumer
    ) external nonReentrant onlyTracker {
        if (referredFrom[consumer] != address(0)) {
            revert OvaReferralAlreadyReferred();
        }

        if (source == address(0)) revert OvaReferralZeroAddress();

        referredFrom[consumer] = source;
        referredUsers[source].push(consumer);

        emit Referral(source, consumer);
    }

    /// @notice Track a new points update
    /// @param source The user address to track
    /// @param amount The amount of points to be tracked
    function track(address source, uint256 amount) external onlyTracker {
        generatedPoints[source] += amount;
    }

    /// @notice Add a new points tracker
    /// @param tracker The tracker address
    function addPointsTracker(address tracker) external onlyOwner {
        allowedPointsTrackers[tracker] = true;
        emit AddTracker(tracker);
    }

    /// @notice Remove a points tracker
    /// @param tracker The tracker address
    function removePointsTracker(address tracker) external onlyOwner {
        allowedPointsTrackers[tracker] = false;
        emit RemoveTracker(tracker);
    }

    /// @notice Retrieve all the referred user for a given address
    /// @param source The query key
    /// @return All the referred user addresses
    function seeReferred(
        address source
    ) external view returns (address[] memory) {
        return referredUsers[source];
    }
}
