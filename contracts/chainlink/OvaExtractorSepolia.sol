// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @title OvaExtractorSepolia Lottery Contract
/// @notice This contract manages a lottery by storing a list of participants and selecting a winner using Chainlink VRF randomness.
/// @dev Inherits from VRFConsumerBaseV2Plus which includes owner-based access control.
contract OvaExtractorSepolia is VRFConsumerBaseV2Plus {
    /// @notice Emitted when a random words request is sent.
    /// @param requestId The ID of the VRF request.
    /// @param numWords The number of random words requested.
    event RequestSent(uint256 requestId, uint32 numWords);

    /// @notice Emitted when a VRF request is fulfilled.
    /// @param requestId The ID of the fulfilled VRF request.
    /// @param randomWords The random words returned by the VRF coordinator.
    event RequestFulfilled(uint256 requestId, uint256[] randomWords);

    /// @notice Emitted when a winner is set.
    /// @param winner The winner selected from the participants list.
    event WinnerSet(string winner);

    /// @notice Structure to store the status of a VRF request.
    struct RequestStatus {
        bool fulfilled; // Whether the request has been successfully fulfilled.
        bool exists; // Whether the request exists.
        uint256[] randomWords; // The random words returned by the request.
    }

    /// @notice Mapping from request IDs to their corresponding status.
    mapping(uint256 => RequestStatus) public s_requests;

    /// @notice The subscription ID used for Chainlink VRF.
    uint256 public s_subscriptionId;

    /// @notice Array of participants in the lottery.
    string[] public participants;

    /// @notice The final winner of the lottery.
    string public winner;

    /// @notice Flag indicating whether a winner has been set.
    bool public winnerSet;

    /// @notice Array storing past VRF request IDs.
    uint256[] public requestIds;

    /// @notice The last VRF request ID sent.
    uint256 public lastRequestId;

    /// @notice The gas lane to use for the VRF request.
    /// @dev See https://docs.chain.link/vrf/v2-5/supported-networks for available gas lanes.
    bytes32 public keyHash =
        0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;

    /// @notice The callback gas limit for the VRF request.
    uint32 public callbackGasLimit = 100000;

    /// @notice The number of confirmations for the VRF request.
    uint16 public requestConfirmations = 3;

    /// @notice The number of random words to request.
    /// @dev Must not exceed VRFCoordinatorV2_5.MAX_NUM_WORDS.
    uint32 public numWords = 1;

    /**
     * @notice Constructs the OvaExtractorSepolia contract.
     * @param subscriptionId The subscription ID for Chainlink VRF.
     * @dev Uses the Sepolia coordinator address.
     */
    constructor(
        uint256 subscriptionId
    ) VRFConsumerBaseV2Plus(0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B) {
        s_subscriptionId = subscriptionId;
    }

    /**
     * @notice Adds a new participant to the lottery.
     * @param who The participant identifier.
     * @dev Only callable by the owner.
     */
    function addParticipant(string memory who) external onlyOwner {
        participants.push(who);
    }

    /**
     * @notice Sets the list of participants, replacing any existing list.
     * @param participants_ The new list of participant identifiers.
     * @dev Only callable by the owner.
     */
    function setParticipants(string[] memory participants_) external onlyOwner {
        delete participants;
        for (uint256 i = 0; i < participants_.length; ) {
            participants.push(participants_[i]);
            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Resets the participants list.
     * @dev Only callable by the owner.
     */
    function resetParticipants() external onlyOwner {
        delete participants;
    }

    /**
     * @notice Requests random words from the Chainlink VRF coordinator.
     * @param enableNativePayment Set to true to enable payment in native tokens; false to pay in LINK.
     * @return requestId The ID of the VRF request.
     * @dev Only callable by the owner. The subscription must be funded.
     */
    function requestRandomWords(
        bool enableNativePayment
    ) external onlyOwner returns (uint256 requestId) {
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: s_subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: numWords,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({
                        nativePayment: enableNativePayment
                    })
                )
            })
        );
        s_requests[requestId] = RequestStatus({
            randomWords: new uint256[](0),
            exists: true,
            fulfilled: false
        });
        requestIds.push(requestId);
        lastRequestId = requestId;
        emit RequestSent(requestId, numWords);
        return requestId;
    }

    /**
     * @notice Callback function used by the VRF coordinator to return random words.
     * @param _requestId The ID of the VRF request.
     * @param _randomWords The array of random words returned.
     */
    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] calldata _randomWords
    ) internal override {
        require(s_requests[_requestId].exists, "request not found");
        s_requests[_requestId].fulfilled = true;
        s_requests[_requestId].randomWords = _randomWords;
        emit RequestFulfilled(_requestId, _randomWords);
    }

    /**
     * @notice Retrieves the status of a VRF request.
     * @param _requestId The ID of the VRF request.
     * @return fulfilled True if the request has been fulfilled.
     * @return randomWords The random words returned by the request.
     */
    function getRequestStatus(
        uint256 _requestId
    ) public view returns (bool fulfilled, uint256[] memory randomWords) {
        require(s_requests[_requestId].exists, "request not found");
        RequestStatus memory request = s_requests[_requestId];
        return (request.fulfilled, request.randomWords);
    }

    /**
     * @notice Resets the winner for the current lottery round.
     * @dev Only callable by the owner.
     */
    function resetWinner() external onlyOwner {
        delete winner;
        winnerSet = false;
    }

    /**
     * @notice Assigns a winner based on a fulfilled VRF request.
     * @param _requestId The ID of the fulfilled VRF request.
     * @dev Uses the first random word to select a winner via modulo operation.
     *      Only callable by the owner. Reverts if no participants exist or if a winner is already set.
     */
    function assignWinnerFromRequest(uint256 _requestId) external onlyOwner {
        require(participants.length > 0, "no participants");
        require(!winnerSet, "winner already set");
        (bool fulfilled, uint256[] memory words) = getRequestStatus(_requestId);
        require(fulfilled, "request not fulfilled");
        uint256 word = words[0];
        uint256 winnerId = word % participants.length;
        winner = participants[winnerId];
        winnerSet = true;

        emit WinnerSet(winner);
    }
}
