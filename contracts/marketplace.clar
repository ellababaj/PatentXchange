;; Marketplace Contract
;; Clarity v2
;; Implements a marketplace for buying, selling, and licensing patent NFTs

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-TOKEN-ID u201)
(define-constant ERR-NOT-LISTED u202)
(define-constant ERR-ALREADY-LISTED u203)
(define-constant ERR-INVALID-PRICE u204)
(define-constant ERR-INSUFFICIENT-FUNDS u205)
(define-constant ERR-PAUSED u206)
(define-constant ERR-ZERO-ADDRESS u207)
(define-constant ERR-INVALID-LICENSE-TERM u208)
(define-constant ERR-ESCROW-LOCKED u209)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var patent-nft-contract principal 'SP000000000000000000002Q6VF78) ;; Placeholder for PatentNFT contract
(define-data-var escrow-fee uint u100) ;; 1% fee in basis points

;; Listing data
(define-map listings
  { token-id: uint }
  {
    seller: principal,
    price: uint,
    license-term: (optional uint), ;; None for sale, Some for license duration (blocks)
    royalty-rate: uint ;; Basis points (e.g., 500 = 5%)
  }
)

;; Escrow for secure transactions
(define-map escrow
  { token-id: uint }
  {
    buyer: principal,
    amount: uint,
    locked-until: uint
  }
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: check patent ownership
(define-private (is-owner (token-id uint) (caller principal))
  (is-eq caller (unwrap! (contract-call? (var-get patent-nft-contract) get-owner token-id) (err ERR-INVALID-TOKEN-ID)))
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

;; Set patent NFT contract
(define-public (set-patent-nft-contract (contract principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq contract 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set patent-nft-contract contract)
    (ok true)
  )
)

;; Set escrow fee
(define-public (set-escrow-fee (fee uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= fee u1000) (err ERR-INVALID-PRICE)) ;; Max 10% fee
    (var-set escrow-fee fee)
    (ok true)
  )
)

;; List patent for sale or license
(define-public (list-patent (token-id uint) (price uint) (license-term (optional uint)) (royalty-rate uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-owner token-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (> price u0) (err ERR-INVALID-PRICE))
    (asserts! (<= royalty-rate u1000) (err ERR-INVALID-PRICE)) ;; Max 10% royalty
    (match license-term term (asserts! (> term u0) (err ERR-INVALID-LICENSE-TERM)) true)
    (asserts! (is-none (map-get? listings { token-id: token-id })) (err ERR-ALREADY-LISTED))
    (map-set listings
      { token-id: token-id }
      {
        seller: tx-sender,
        price: price,
        license-term: license-term,
        royalty-rate: royalty-rate
      }
    )
    (ok true)
  )
)

;; Unlist patent
(define-public (unlist-patent (token-id uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-owner token-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? listings { token-id: token-id })) (err ERR-NOT-LISTED))
    (map-delete listings { token-id: token-id })
    (ok true)
  )
)

;; Buy patent NFT
(define-public (buy-patent (token-id uint))
  (begin
    (ensure-not-paused)
    (let
      (
        (listing (unwrap! (map-get? listings { token-id: token-id }) (err ERR-NOT-LISTED)))
        (seller (get seller listing))
        (price (get price listing))
        (fee (/ (* price (var-get escrow-fee)) u10000))
        (seller-amount (- price fee))
      )
      (asserts! (is-none (get license-term listing)) (err ERR-INVALID-LICENSE-TERM))
      (try! (stx-transfer? price tx-sender seller))
      (try! (stx-transfer? fee tx-sender (var-get admin)))
      (try! (contract-call? (var-get patent-nft-contract) transfer token-id seller tx-sender))
      (map-delete listings { token-id: token-id })
      (map-delete escrow { token-id: token-id })
      (ok true)
    )
  )
)

;; License patent NFT
(define-public (license-patent (token-id uint))
  (begin
    (ensure-not-paused)
    (let
      (
        (listing (unwrap! (map-get? listings { token-id: token-id }) (err ERR-NOT-LISTED)))
        (seller (get seller listing))
        (price (get price listing))
        (fee (/ (* price (var-get escrow-fee)) u10000))
        (seller-amount (- price fee))
        (license-term (unwrap! (get license-term listing) (err ERR-INVALID-LICENSE-TERM)))
      )
      (try! (stx-transfer? price tx-sender seller))
      (try! (stx-transfer? fee tx-sender (var-get admin)))
      (map-set escrow
        { token-id: token-id }
        {
          buyer: tx-sender,
          amount: price,
          locked-until: (+ block-height license-term)
        }
      )
      (ok true)
    )
  )
)

;; Release escrow after license term
(define-public (release-escrow (token-id uint))
  (begin
    (ensure-not-paused)
    (let
      (
        (escrow-data (unwrap! (map-get? escrow { token-id: token-id }) (err ERR-NOT-LISTED)))
        (locked-until (get locked-until escrow-data))
      )
      (asserts! (>= block-height locked-until) (err ERR-ESCROW-LOCKED))
      (map-delete escrow { token-id: token-id })
      (ok true)
    )
  )
)

;; Read-only: get listing
(define-read-only (get-listing (token-id uint))
  (ok (map-get? listings { token-id: token-id }))
)

;; Read-only: get escrow
(define-read-only (get-escrow (token-id uint))
  (ok (map-get? escrow { token-id: token-id }))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: get patent NFT contract
(define-read-only (get-patent-nft-contract)
  (ok (var-get patent-nft-contract))
)

;; Read-only: get escrow fee
(define-read-only (get-escrow-fee)
  (ok (var-get escrow-fee))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)