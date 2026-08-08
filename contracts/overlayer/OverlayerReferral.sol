// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "./MintableTokenBase.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./interfaces/IOverlayerReferral.sol";
import {ILiquidityDefs} from "../liquidity/interfaces/ILiquidityDefs.sol";

/**
 * @title OverlayerReferral
 * @notice This token tracks the referral points for the Overlayer airdrop.
 * @dev Referral types Team and Ref are independent. Create/consume exclusivity is per type only.
 * @dev Team codes start closed: only whitelisted members can join until the owner opens the team.
 * @dev OVERP is non-transferable: only mint (from zero) and burn (to zero) may change balances.
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

    /// @notice Generated referral points by address and type
    mapping(address => mapping(ReferralType => uint256))
        public generatedPointsByType;

    /// @notice External entities who can control the points tracking
    mapping(address => bool) public allowedPointsTrackers;

    /// @notice All the referral codes
    string[] public codes;

    /// @notice All staking pools where this token is emitted from
    address[] public stakingPools;

    /// @notice Team owner => whether anyone can join without whitelist
    mapping(address => bool) public teamOpen;

    /// @notice Team owner => member => whether whitelisted to join while closed
    mapping(address => mapping(address => bool)) public teamWhitelist;

    /// @notice Merkle root for off-chain OVERP allocations (address + amount leaves)
    bytes32 public pointsMerkleRoot;

    /// @notice Whether an account has claimed against a given points Merkle root
    mapping(bytes32 => mapping(address => bool)) public hasClaimedPoints;

    event Referral(
        address indexed source,
        address consumer,
        ReferralType referralType
    );
    event NewCode(string code, address holder, ReferralType referralType);
    event AddTracker(address tracker);
    event RemoveTracker(address tracker);
    event StakingPoolSet(address[] pools);
    event TeamOpenUpdated(address indexed owner, bool open);
    event TeamWhitelistUpdated(
        address indexed owner,
        address indexed member,
        bool allowed
    );
    event PointsMerkleRootUpdated(bytes32 indexed merkleRoot);
    event PointsClaimed(address indexed user, uint256 amount, bytes32 root);

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
    /// @notice Team is closed and consumer is not on the team whitelist
    error OverlayerReferralNotWhitelisted();
    /// @notice Caller does not own a Team referral code
    error OverlayerReferralNotTeamOwner();
    /// @notice OVERP cannot be transferred between accounts
    error OverlayerReferralNonTransferable();
    /// @notice Merkle proof is invalid or root is unset
    error OverlayerReferralInvalidMerkleProof();
    /// @notice Caller already claimed against the current points Merkle root
    error OverlayerReferralAlreadyClaimed();
    /// @notice Claim amount must be non-zero
    error OverlayerReferralZeroAmount();

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
    ) MintableTokenBase(admin_, "OverlayerPoints", "OVERP") {}

    /// @dev Allow only mint (from == 0) and burn (to == 0); block peer transfers.
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (from != address(0) && to != address(0)) {
            revert OverlayerReferralNonTransferable();
        }
        super._update(from, to, value);
    }

    function getStakingPools() external view returns (address[] memory) {
        return stakingPools;
    }

    function setStakingPools(address[] memory pools_) external onlyOwner {
        stakingPools = pools_;
        emit StakingPoolSet(pools_);
    }

    /// @notice Set the Merkle root for off-chain OVERP allocations
    /// @dev Leaf is double-hashed `abi.encode(account, amount)` (same style as Origin NFT).
    ///      Replacing the root enables a new campaign; claims are tracked per root.
    /// @param merkleRoot_ Root of (address, amount) leaves; zero disables claims
    function setPointsMerkleRoot(bytes32 merkleRoot_) external onlyOwner {
        pointsMerkleRoot = merkleRoot_;
        emit PointsMerkleRootUpdated(merkleRoot_);
    }

    /// @notice Claim OVERP via Merkle proof; mints `amount_` to the caller
    /// @param amount_ Allocation amount encoded in the caller's leaf
    /// @param proof_ Sorted Merkle sibling hashes
    function claimPoints(
        uint256 amount_,
        bytes32[] calldata proof_
    ) external override nonReentrant {
        if (amount_ == 0) {
            revert OverlayerReferralZeroAmount();
        }
        bytes32 root = pointsMerkleRoot;
        if (root == bytes32(0)) {
            revert OverlayerReferralInvalidMerkleProof();
        }
        if (hasClaimedPoints[root][msg.sender]) {
            revert OverlayerReferralAlreadyClaimed();
        }
        if (
            !MerkleProof.verifyCalldata(
                proof_,
                root,
                pointsMerkleLeaf(msg.sender, amount_)
            )
        ) {
            revert OverlayerReferralInvalidMerkleProof();
        }
        hasClaimedPoints[root][msg.sender] = true;
        _mint(msg.sender, amount_);
        emit PointsClaimed(msg.sender, amount_, root);
    }

    /// @notice Double-hashed leaf for an (account, amount) allocation
    /// @param account_ Claimant address
    /// @param amount_ OVERP amount (wei)
    function pointsMerkleLeaf(
        address account_,
        uint256 amount_
    ) public pure override returns (bytes32) {
        return
            keccak256(bytes.concat(keccak256(abi.encode(account_, amount_))));
    }

    /// @notice Whether an account can claim `amount_` with the given proof
    function canClaimPoints(
        address account_,
        uint256 amount_,
        bytes32[] calldata proof_
    ) external view override returns (bool) {
        bytes32 root = pointsMerkleRoot;
        if (root == bytes32(0) || amount_ == 0) {
            return false;
        }
        if (hasClaimedPoints[root][account_]) {
            return false;
        }
        return
            MerkleProof.verifyCalldata(
                proof_,
                root,
                pointsMerkleLeaf(account_, amount_)
            );
    }

    /// @notice Open or close the caller's Team for joining
    /// @dev Team codes start closed. Opening does not clear the whitelist.
    /// @param open_ True to allow anyone to join; false to require whitelist
    function setTeamOpen(bool open_) external {
        _requireTeamOwner(msg.sender);
        teamOpen[msg.sender] = open_;
        emit TeamOpenUpdated(msg.sender, open_);
    }

    /// @notice Add or remove a member from the caller's Team whitelist
    /// @param member_ The member address
    /// @param allowed_ True to whitelist; false to remove
    function setTeamWhitelist(address member_, bool allowed_) external {
        _requireTeamOwner(msg.sender);
        _setTeamWhitelist(msg.sender, member_, allowed_);
    }

    /// @notice Batch add or remove members from the caller's Team whitelist
    /// @param members_ The member addresses
    /// @param allowed_ True to whitelist; false to remove
    function batchSetTeamWhitelist(
        address[] calldata members_,
        bool allowed_
    ) external {
        _requireTeamOwner(msg.sender);
        for (uint256 i = 0; i < members_.length; ) {
            _setTeamWhitelist(msg.sender, members_[i], allowed_);
            unchecked {
                i++;
            }
        }
    }

    /// @notice Consume a referral code
    /// @dev Create/consume exclusivity is enforced per type only. Staking pools must be set.
    /// @dev Team: closed by default — consumer must be whitelisted unless the team is open.
    ///      Harvests all open positions first so bonuses apply only to future accrual.
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

        // Team join gate: open teams allow anyone; closed require whitelist
        if (
            type_ == ReferralType.Team &&
            !teamOpen[source] &&
            !teamWhitelist[source][consumer]
        ) {
            revert OverlayerReferralNotWhitelisted();
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

    /// @notice Track a new points update for a referral type
    /// @param source_ The user address to track
    /// @param amount_ The amount of points to be tracked
    /// @param type_ The referral type
    function track(
        address source_,
        uint256 amount_,
        ReferralType type_
    ) external override onlyTracker {
        if (!_isValidType(type_)) {
            revert OverlayerReferralInvalidType();
        }
        generatedPointsByType[source_][type_] += amount_;
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

    /// @inheritdoc IOverlayerReferral
    function isTeamOpen(address owner_) external view override returns (bool) {
        return teamOpen[owner_];
    }

    /// @inheritdoc IOverlayerReferral
    function isTeamWhitelisted(
        address owner_,
        address member_
    ) external view override returns (bool) {
        return teamWhitelist[owner_][member_];
    }

    /// @inheritdoc IOverlayerReferral
    function canJoinTeam(
        address owner_,
        address consumer_
    ) external view override returns (bool) {
        return teamOpen[owner_] || teamWhitelist[owner_][consumer_];
    }

    /// @inheritdoc IOverlayerReferral
    function generatedPoints(
        address user_
    ) external view override returns (uint256) {
        return
            generatedPointsByType[user_][ReferralType.Team] +
            generatedPointsByType[user_][ReferralType.Ref];
    }

    /// @notice Points earned by a code (for that code's type only)
    /// @param code_ The referral code
    /// @return Points for the code's type
    function codeTotalPoints(
        string memory code_
    ) external view returns (uint256) {
        address source = referralCodes[code_];
        ReferralType type_ = referralCodeTypes[code_];
        return generatedPointsByType[source][type_];
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
        // Team codes start closed (teamOpen[holder_] defaults to false)
        emit NewCode(code_, holder_, type_);
    }

    function _requireTeamOwner(address owner_) internal view {
        if (bytes(referralCodesByType[owner_][ReferralType.Team]).length == 0) {
            revert OverlayerReferralNotTeamOwner();
        }
    }

    function _setTeamWhitelist(
        address owner_,
        address member_,
        bool allowed_
    ) internal {
        if (member_ == address(0)) {
            revert OverlayerReferralZeroAddress();
        }
        bool currently = teamWhitelist[owner_][member_];
        if (allowed_ == currently) {
            return;
        }
        teamWhitelist[owner_][member_] = allowed_;
        emit TeamWhitelistUpdated(owner_, member_, allowed_);
    }

    function _isValidType(ReferralType type_) internal pure returns (bool) {
        return type_ == ReferralType.Team || type_ == ReferralType.Ref;
    }
}
