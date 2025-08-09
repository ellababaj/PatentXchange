;; PatentNFT Contract
;; Clarity v2
;; Implements NFT-based patent tokenization with metadata, ownership, and verification controls

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-ALREADY-MINTED u101)
(define-constant ERR-NOT-MINTED u102)
(define-constant ERR-NOT-VERIFIED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-METADATA u106)
(define-constant ERR-INVALID-TOKEN-ID u107)
(define-constant ERR-TRANSFER-LOCKED u108)

;; NFT metadata
(define-constant TOKEN-NAME "PatentXchange NFT")
(define-constant TOKEN-SYMBOL "PXNFT")

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var token-id-counter uint u0)
(define-data-var verification-oracle principal 'SP000000000000000000002Q6VF78) ;; Placeholder for oracle

;; Patent NFT data
(define-map patents
  { token-id: uint }
  {
    patent-id: (string-ascii 64),
    metadata-uri: (string-ascii 256),
    inventor: principal,
    verified: bool,
    transfer-locked: bool
  }
)

;; Ownership tracking
(define-map owners { token-id: uint } principal)
(define-map approvals { token-id: uint } principal)
(define-map token-count principal uint)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate metadata
(define-private (validate-metadata (patent-id (string-ascii 64)) (metadata-uri (string-ascii 256)))
  (and
    (> (len patent-id) u0)
    (<= (len patent-id) u64)
    (> (len metadata-uri) u0)
    (<= (len metadata-uri) u256)
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Set verification oracle
(define-public (set-verification-oracle (oracle principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq oracle 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set verification-oracle oracle)
    (ok true)
  )
)

;; Mint a new patent NFT
(define-public (mint-patent (patent-id (string-ascii 64)) (metadata-uri (string-ascii 256)) (inventor principal))
  (begin
    (ensure-not-paused)
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq inventor 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-metadata patent-id metadata-uri) (err ERR-INVALID-METADATA))
    (let
      (
        (token-id (+ (var-get token-id-counter) u1))
      )
      (asserts! (is-none (map-get? patents { token-id: token-id })) (err ERR-ALREADY-MINTED))
      (map-set patents
        { token-id: token-id }
        {
          patent-id: patent-id,
          metadata-uri: metadata-uri,
          inventor: inventor,
          verified: false,
          transfer-locked: true
        }
      )
      (map-set owners { token-id: token-id } inventor)
      (map-set token-count inventor (+ u1 (default-to u0 (map-get? token-count inventor))))
      (var-set token-id-counter token-id)
      (ok token-id)
    )
  )
)

;; Verify a patent NFT
(define-public (verify-patent (token-id uint))
  (begin
    (asserts! (is-eq tx-sender (var-get verification-oracle)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? patents { token-id: token-id })) (err ERR-NOT-MINTED))
    (let
      (
        (patent (unwrap! (map-get? patents { token-id: token-id }) (err ERR-NOT-MINTED)))
      )
      (map-set patents
        { token-id: token-id }
        (merge patent { verified: true, transfer-locked: false })
      )
      (ok true)
    )
  )
)

;; Transfer patent NFT
(define-public (transfer (token-id uint) (recipient principal))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let
      (
        (owner (unwrap! (map-get? owners { token-id: token-id }) (err ERR-NOT-MINTED)))
        (patent (unwrap! (map-get? patents { token-id: token-id }) (err ERR-NOT-MINTED)))
      )
      (asserts! (is-eq tx-sender owner) (err ERR-NOT-AUTHORIZED))
      (asserts! (not (get transfer-locked patent)) (err ERR-TRANSFER-LOCKED))
      (asserts! (get verified patent) (err ERR-NOT-VERIFIED))
      (map-set owners { token-id: token-id } recipient)
      (map-set token-count owner (- (default-to u0 (map-get? token-count owner)) u1))
      (map-set token-count recipient (+ u1 (default-to u0 (map-get? token-count recipient))))
      (map-delete approvals { token-id: token-id })
      (ok true)
    )
  )
)

;; Approve an operator for a patent NFT
(define-public (approve (token-id uint) (operator principal))
  (begin
    (ensure-not-paused)
    (let
      (
        (owner (unwrap! (map-get? owners { token-id: token-id }) (err ERR-NOT-MINTED)))
      )
      (asserts! (is-eq tx-sender owner) (err ERR-NOT-AUTHORIZED))
      (asserts! (not (is-eq operator 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
      (map-set approvals { token-id: token-id } operator)
      (ok true)
    )
  )
)

;; Read-only: get patent details
(define-read-only (get-patent-details (token-id uint))
  (ok (map-get? patents { token-id: token-id }))
)

;; Read-only: get owner
(define-read-only (get-owner (token-id uint))
  (ok (map-get? owners { token-id: token-id }))
)

;; Read-only: get token count
(define-read-only (get-token-count (account principal))
  (ok (default-to u0 (map-get? token-count account)))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: get verification oracle
(define-read-only (get-verification-oracle)
  (ok (var-get verification-oracle))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: get total minted
(define-read-only (get-total-minted)
  (ok (var-get token-id-counter))
)