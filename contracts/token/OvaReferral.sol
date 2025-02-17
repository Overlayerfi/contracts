// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./GovernanceTokenBase.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IOvaReferral.sol";
import {ILiquidityDefs} from "../liquidity/interfaces/ILiquidityDefs.sol";

/**
 * @title OvaReferral
 * @notice This token tracks the referral points for OVA airdrop.
 */
contract OvaReferral is GovernanceTokenBase, ReentrancyGuard, IOvaReferral {
    /// @notice Track the referral source for given address
    mapping(address => address) public referredFrom;

    /// @notice Track all the referred users for a given address
    mapping(address => address[]) public referredUsers;

    /// @notice Track all the generated referral points for given address
    mapping(address => uint256) public generatedPoints;

    /// @notice External entities who can control the points tracking
    mapping(address => bool) public allowedPointsTrackers;

    /// @notice Referral code to its creator address
    mapping(string => address) public referralCodes;

    /// @notice Referral code creator address to code
    mapping(address => string) public referralCodesRev;

    /// @notice All the referral codes
    string[] public codes;

    /// @notice All staking pools where this token is emitted from
    address[] public stakingPools;

    event Referral(address indexed source, address consumer);
    event NewCode(string code, address holder);
    event AddTracker(address tracker);
    event RemoveTracker(address tracker);
    event StakingPoolSet(address[] pools);

    error OvaReferralAlreadyReferred();
    error OvaReferralZeroAddress();
    error OvaReferralNotAllowed();
    error OvaReferralCodeNotValid();
    error OvaReferralCodeAlreadyUsed();
    error OvaReferralAlreadyCreatedACode();
    error OvaReferralStakingPoolsNotSet();

    modifier onlyTracker() {
        if (!allowedPointsTrackers[msg.sender] && msg.sender != address(this)) {
            revert OvaReferralNotAllowed();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin The contract admin
    constructor(
        address admin
    ) GovernanceTokenBase(admin, "Airdrop OVA", "AOVA") {}

    function getStakingPools() external view returns (address[] memory) {
        return stakingPools;
    }

    function setStakingPools(address[] memory pools_) external onlyOwner {
        stakingPools = pools_;
        emit StakingPoolSet(pools_);
    }

    /// @notice Consume a referral code. This action will harvest all the user positions in the staking pools
    /// @dev Code holders can not use any code
    /// @dev Staking pools must be set
    /// @param code The referral code
    function consumeReferral(
        string memory code
    ) external override nonReentrant {
        address consumer = msg.sender;
        if (referredFrom[consumer] != address(0)) {
            revert OvaReferralAlreadyReferred();
        }
        if (referralCodes[code] == address(0)) {
            revert OvaReferralCodeNotValid();
        }
        // Code providers can not use any referral
        if (bytes(referralCodesRev[consumer]).length > 0) {
            revert OvaReferralNotAllowed();
        }
        address source = referralCodes[code];
        // Can not refer self
        if (source == consumer) {
            revert OvaReferralNotAllowed();
        }
        if (source == address(0)) {
            revert OvaReferralZeroAddress();
        }

        if (stakingPools.length == 0) {
            revert OvaReferralStakingPoolsNotSet();
        }
        for (uint256 i = 0; i < stakingPools.length; ) {
            ILiquidityDefs stakingPool = ILiquidityDefs(stakingPools[i]);
            uint256 stakingPoolLen = stakingPool.poolLength();
            for (uint256 j = 0; j < stakingPoolLen; ) {
                (uint256 userAmount, ) = stakingPool.userInfo(j, consumer);
                if (userAmount > 0) {
                    stakingPool.harvestFor(j, consumer);
                }
                unchecked {
                    j++;
                }
            }
            unchecked {
                i++;
            }
        }

        referredFrom[consumer] = source;
        referredUsers[source].push(consumer);

        emit Referral(source, consumer);
    }

    /// @notice Track a new points update
    /// @param source The user address to track
    /// @param amount The amount of points to be tracked
    function track(
        address source,
        uint256 amount
    ) external override onlyTracker {
        generatedPoints[source] += amount;
    }

    /// @notice Add a new points tracker
    /// @param tracker The tracker address
    function addPointsTracker(address tracker) external onlyOwner {
        allowedPointsTrackers[tracker] = true;
        emit AddTracker(tracker);
    }

    /// @notice Add a new referral code
    /// @param code The tracker address
    /// @param holder The code owner
    function addCode(string memory code, address holder) external onlyOwner {
        if (holder == address(0)) {
            revert OvaReferralZeroAddress();
        }
        // Code users can not create codes
        if (referredFrom[holder] != address(0)) {
            revert OvaReferralAlreadyReferred();
        }
        if (referralCodes[code] != address(0)) {
            revert OvaReferralCodeAlreadyUsed();
        }
        if (bytes(referralCodesRev[holder]).length > 0) {
            revert OvaReferralAlreadyCreatedACode();
        }
        referralCodes[code] = holder;
        referralCodesRev[holder] = code;
        codes.push(code);
        emit NewCode(code, holder);
    }

    /// @notice Add a new referral code for the caller
    /// @param code The tracker address
    function addCodeSelf(string memory code) external {
        address holder = msg.sender;
        if (holder == address(0)) {
            revert OvaReferralZeroAddress();
        }
        // Code users can not create codes
        if (referredFrom[holder] != address(0)) {
            revert OvaReferralAlreadyReferred();
        }
        if (referralCodes[code] != address(0)) {
            revert OvaReferralCodeAlreadyUsed();
        }
        if (bytes(referralCodesRev[holder]).length > 0) {
            revert OvaReferralAlreadyCreatedACode();
        }
        referralCodes[code] = holder;
        referralCodesRev[holder] = code;
        codes.push(code);
        emit NewCode(code, holder);
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
    ) external view override returns (address[] memory) {
        return referredUsers[source];
    }

    /// @notice Retrieve all the referred user for a given address
    /// @param code The query key
    /// @return All the referred user addresses
    function seeReferredByCode(
        string memory code
    ) external view returns (address[] memory) {
        address source = referralCodes[code];
        return referredUsers[source];
    }

    /// @notice Retrieve all points earned by a given code
    /// @param code The referral code
    /// @return The total points
    function codeTotalPoints(
        string memory code
    ) external view returns (uint256) {
        address source = referralCodes[code];
        return generatedPoints[source];
    }

    /// @notice Retrieve all the active referral codes
    /// @return The active referral codes
    function allCodes() external view returns (string[] memory) {
        return codes;
    }

    /// @notice Retrieve referral codes count
    /// @return The active referral codes count
    function totalCodes() external view returns (uint256) {
        return codes.length;
    }
}
