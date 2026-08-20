# WB / Supplier Document Import Contract

## Purpose

The supplied workbook `ИПК9счетнаоплатунакладной(1).xlsx` contains paired examples of invoices (`счет на оплату`), delivery notes (`накладная`) and several work-completion acts (`АВР`). It must be treated as an **untrusted input example**, not as a canonical legal template and not as a source of truth for customer data.

The import feature must support reusable mappings for WB/supplier/marketplace document templates. It must never import a sheet by positional columns without a visible preview, mapping, validation report and human confirmation.

## Expected source objects

| Source type | Example fields to extract | MarkFlow target |
|---|---|---|
| Invoice | supplier, buyer, document number/date, payment terms, currency, positions, quantity, unit price, total | `CommercialInvoice` / billing source / code-order source |
| Delivery note | sender, receiver, document number/date, shipment data, position, unit, planned/actual quantity, price, totals | `ShipmentDocument` and `Shipment` source |
| Work-completion act | parties, document reference, period, services, amount, acceptance data | `FinancialDocument` / closing document |
| Label/image attachment | source file, content type, checksum, template identification | secured file evidence; never the source of a marking code |

## Import pipeline

```text
Upload
→ virus/content-type/size check
→ store encrypted original with checksum
→ choose template version
→ preview workbook/sheets
→ map fields
→ parse and normalize
→ validate rows
→ resolve counterparty/product references
→ show errors and duplicates
→ human confirmation
→ create versioned document + source lines
→ optional link to shipment/order/operation
→ audit
```

## Mandatory validation

The importer must validate document number/date, supplier/buyer identifier, line identifier, unit, decimal quantity, integer/decimal price rules, currency, totals, duplicate rows and accounting reconciliation. It must display discrepancies rather than normalize them silently. The sample workbook itself demonstrates why this matters: visual line totals, repeated/merged cells and document totals can disagree or be structurally ambiguous after extraction.

## Product matching

Product matching proceeds in this order: supplier SKU or contract code; GTIN; NTIN; tenant product code; normalized name plus unit/volume; manual mapping. A fuzzy match is only a suggestion. It cannot create a production product card or code order without a human-confirmed match.

## Security and audit

Original files are retained with checksum, source, uploader, template version and parser version. Parsed values contain a provenance pointer to original sheet/cell where available. Sensitive commercial documents follow tenant scope, storage policy and export audit. AI/OCR may assist only where deterministic Excel parsing is insufficient, and its confidence/result must be presented for confirmation.
