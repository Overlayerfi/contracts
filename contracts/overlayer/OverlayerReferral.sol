// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "./MintableTokenBase.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IOverlayerReferral.sol";
import {ILiquidityDefs} from "../liquidity/interfaces/ILiquidityDefs.sol";

/**
 * @title OverlayerReferral
 * @notice This token tracks the referral points for the Overlayer airdrop.
 * @dev Referral types Team and Ref are independent. Create/consume exclusivity is per type only.
 */
contract OverlayerReferral is
    MintableTokenBase,
    ReentrancyGuard,
    IOverlayerReferral
{
    /// @notice Referral code to its creator address
    mapping(string => address) public referralCodes;

    /// @notice Referral code to its type
    mapping(string => ReferralType) public referralCodeTypes;

    /// @notice Holder + type to their referral code
    mapping(address => mapping(ReferralType => string))
        public referralCodesByType;

    /// @notice Consumer + type to the address that referred them
    mapping(address => mapping(ReferralType => address))
        public referredFromByType;

    /// @notice Referrer + type to all referred users
    mapping(address => mapping(ReferralType => address[]))
        private referredUsersByType;

    /// @notice Track all the generated referral points for given address
    mapping(address => uint256) public generatedPoints;

    /// @notice External entities who can control the points tracking
    mapping(address => bool) public allowedPointsTrackers;

    /// @notice All the referral codes
    string[] public codes;

    /// @notice All staking pools where this token is emitted from
    address[] public stakingPools;

    event Referral(
        address indexed source,
        address consumer,
        ReferralType referralType
    );
    event NewCode(string code, address holder, ReferralType referralType);
    event AddTracker(address tracker);
    event RemoveTracker(address tracker);
    event StakingPoolSet(address[] pools);

    error OverlayerReferralAlreadyReferred();
    error OverlayerReferralZeroAddress();
    error OverlayerReferralNotAllowed();
    error OverlayerReferralCodeNotValid();
    error OverlayerReferralCodeAlreadyUsed();
    error OverlayerReferralAlreadyCreatedACode();
    error OverlayerReferralStakingPoolsNotSet();
    error OverlayerReferralInvalidType();
    /// @notice Ref codes may only be consumed by users with no reward balance and no deposits
    error OverlayerReferralNotFresh();

    modifier onlyTracker() {
        if (!allowedPointsTrackers[msg.sender] && msg.sender != address(this)) {
            revert OverlayerReferralNotAllowed();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin_ The contract admin
    constructor(
        address admin_
    ) MintableTokenBase(admin_, "Airdrop Overlayer", "AOVER") {}

    function getStakingPools() external view returns (address[] memory) {
        return stakingPools;
    }

    function setStakingPools(address[] memory pools_) external onlyOwner {
        stakingPools = pools_;
        emit StakingPoolSet(pools_);
    }

    /// @notice Consume a referral code
    /// @dev Create/consume exclusivity is enforced per type only. Staking pools must be set.
    /// @dev Team: harvests all open positions first so bonuses apply only to future accrual.
    /// @dev Ref: consumer must be fresh — zero reward-token balance and zero deposits in all pools.
    ///      Pending rewards are not checked separately: with amount == 0 they are always zero.
    /// @param code_ The referral code
    function consumeReferral(
        string memory code_
    ) external override nonReentrant {
        address consumer = msg.sender;
        ReferralType type_ = referralCodeTypes[code_];
        if (!_isValidType(type_)) {
            revert OverlayerReferralCodeNotValid();
        }
        if (referredFromByType[consumer][type_] != address(0)) {
            revert OverlayerReferralAlreadyReferred();
        }
        // Cannot consume a type for which the user already created a code
        if (bytes(referralCodesByType[consumer][type_]).length > 0) {
            revert OverlayerReferralNotAllowed();
        }
        address source = referralCodes[code_];
        if (source == address(0)) {
            revert OverlayerReferralCodeNotValid();
        }
        // Can not refer self
        if (source == consumer) {
            revert OverlayerReferralNotAllowed();
        }

        if (stakingPools.length == 0) {
            revert OverlayerReferralStakingPoolsNotSet();
        }

        // Ref also requires no already-claimed reward tokens
        if (type_ == ReferralType.Ref && balanceOf(consumer) > 0) {
            revert OverlayerReferralNotFresh();
        }
        // Shared pool walk: Ref rejects any deposit; Team harvests it
        for (uint256 i = 0; i < stakingPools.length; ) {
            ILiquidityDefs stakingPool = ILiquidityDefs(stakingPools[i]);
            uint256 stakingPoolLen = stakingPool.poolLength();
            for (uint256 j = 0; j < stakingPoolLen; ) {
                (uint256 userAmount, ) = stakingPool.userInfo(j, consumer);
                if (userAmount > 0) {
                    if (type_ == ReferralType.Ref) {
                        revert OverlayerReferralNotFresh();
                    }
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

        referredFromByType[consumer][type_] = source;
        referredUsersByType[source][type_].push(consumer);

        emit Referral(source, consumer, type_);
    }

    /// @notice Track a new points update
    /// @param source_ The user address to track
    /// @param amount_ The amount of points to be tracked
    function track(
        address source_,
        uint256 amount_
    ) external override onlyTracker {
        generatedPoints[source_] += amount_;
    }

    /// @notice Add a new points tracker
    /// @param tracker_ The tracker address
    function addPointsTracker(address tracker_) external onlyOwner {
        allowedPointsTrackers[tracker_] = true;
        emit AddTracker(tracker_);
    }

    /// @notice Add a new referral code
    /// @param code_ The referral code
    /// @param holder_ The code owner
    /// @param type_ The referral type
    function addCode(
        string memory code_,
        address holder_,
        ReferralType type_
    ) external onlyOwner {
        _addCode(code_, holder_, type_);
    }

    /// @notice Add a new referral code for the caller
    /// @param code_ The referral code
    /// @param type_ The referral type
    function addCodeSelf(string memory code_, ReferralType type_) external {
        _addCode(code_, msg.sender, type_);
    }

    /// @notice Remove a points tracker
    /// @param tracker_ The tracker address
    function removePointsTracker(address tracker_) external onlyOwner {
        allowedPointsTrackers[tracker_] = false;
        emit RemoveTracker(tracker_);
    }

    /// @notice Retrieve all the referred users for a given address and type
    /// @param source_ The referrer
    /// @param type_ The referral type
    /// @return All the referred user addresses for that type
    function seeReferredByType(
        address source_,
        ReferralType type_
    ) external view override returns (address[] memory) {
        return referredUsersByType[source_][type_];
    }

    /// @notice Retrieve all the referred users for a given code
    /// @param code_ The referral code
    /// @return All the referred user addresses for that code's type
    function seeReferredByCode(
        string memory code_
    ) external view returns (address[] memory) {
        address source = referralCodes[code_];
        ReferralType type_ = referralCodeTypes[code_];
        return referredUsersByType[source][type_];
    }

    /// @notice Retrieve all points earned by a given code
    /// @param code_ The referral code
    /// @return The total points
    function codeTotalPoints(
        string memory code_
    ) external view returns (uint256) {
        address source = referralCodes[code_];
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

    function _addCode(
        string memory code_,
        address holder_,
        ReferralType type_
    ) internal {
        if (!_isValidType(type_)) {
            revert OverlayerReferralInvalidType();
        }
        if (bytes(code_).length == 0) {
            revert OverlayerReferralCodeNotValid();
        }
        if (holder_ == address(0)) {
            revert OverlayerReferralZeroAddress();
        }
        // Cannot create a type for which the user already consumed a referral
        if (referredFromByType[holder_][type_] != address(0)) {
            revert OverlayerReferralAlreadyReferred();
        }
        if (referralCodes[code_] != address(0)) {
            revert OverlayerReferralCodeAlreadyUsed();
        }
        if (bytes(referralCodesByType[holder_][type_]).length > 0) {
            revert OverlayerReferralAlreadyCreatedACode();
        }
        referralCodes[code_] = holder_;
        referralCodeTypes[code_] = type_;
        referralCodesByType[holder_][type_] = code_;
        codes.push(code_);
        emit NewCode(code_, holder_, type_);
    }

    function _isValidType(ReferralType type_) internal pure returns (bool) {
        return type_ == ReferralType.Team || type_ == ReferralType.Ref;
    }
}
