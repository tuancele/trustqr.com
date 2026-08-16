package handlers

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"trustqr/backend/internal/services"
)

// GS1LabelHandler serves the AI element string (GTIN/lot/serial/dates) used
// to render a GS1 DataMatrix label, separate from the existing QR-token URL
// flow. Actual barcode rendering happens in the frontend (bwip-js), this
// endpoint only resolves + persists the data.
type GS1LabelHandler struct {
	DB *pgxpool.Pool
}

type gs1DataResp struct {
	TokenID         int64   `json:"token_id"`
	GTIN            string  `json:"gtin"`
	Lot             string  `json:"lot"`
	Serial          string  `json:"serial"`
	ManufactureDate string  `json:"manufacture_date"`
	ExpiryDate      *string `json:"expiry_date"`
	ElementString   string  `json:"element_string"`
	ProductName     string  `json:"product_name"`
	ProductCode     *string `json:"product_code"`
	Spec            *string `json:"spec"`
	Unit            *string `json:"unit"`
	OriginCountry   *string `json:"origin_country"`
	Manufacturer    *string `json:"manufacturer"`
}

// GetTokenGS1Data resolves (and lazily assigns) the gs1_serial for a token,
// then returns the AI element string ready to hand to the bwip-js renderer.
func (h *GS1LabelHandler) GetTokenGS1Data(c *fiber.Ctx) error {
	tokenID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid_id"})
	}
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	var (
		gs1Serial                   *string
		lot                         string
		mfgDate, expDate            *time.Time
		gtin, productName           *string
		productCode, spec, unit     *string
		originCountry, importerComp *string
	)
	err = h.DB.QueryRow(ctx, `
		SELECT t.gs1_serial, b.batch_code, b.manufacture_date, b.expiry_date,
		       p.gtin, p.name, p.product_code, p.spec, p.unit, p.origin_country, p.importer_company
		FROM qr_tokens t
		JOIN batches b ON b.id = t.batch_id
		LEFT JOIN products p ON p.id = t.product_id
		WHERE t.id = $1
	`, tokenID).Scan(&gs1Serial, &lot, &mfgDate, &expDate,
		&gtin, &productName, &productCode, &spec, &unit, &originCountry, &importerComp)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(404).JSON(fiber.Map{"error": "not_found"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "db"})
	}

	if gtin == nil || *gtin == "" {
		return c.Status(422).JSON(fiber.Map{"error": "product_gtin_missing"})
	}
	if mfgDate == nil {
		return c.Status(422).JSON(fiber.Map{"error": "batch_manufacture_date_missing"})
	}

	// Lazily assign a gs1_serial the first time this token's label is generated.
	if gs1Serial == nil || *gs1Serial == "" {
		for attempt := 0; attempt < 5; attempt++ {
			candidate, genErr := services.GenerateGS1Serial()
			if genErr != nil {
				return c.Status(500).JSON(fiber.Map{"error": "gen_serial"})
			}
			_, updErr := h.DB.Exec(ctx, `UPDATE qr_tokens SET gs1_serial = $1 WHERE id = $2`, candidate, tokenID)
			if updErr == nil {
				gs1Serial = &candidate
				break
			}
			// Unique violation on gs1_serial -> retry with a new candidate.
		}
		if gs1Serial == nil {
			return c.Status(500).JSON(fiber.Map{"error": "gen_serial_conflict"})
		}
	}

	fields := services.GS1Fields{
		GTIN:            *gtin,
		ManufactureDate: *mfgDate,
		Lot:             lot,
		Serial:          *gs1Serial,
	}
	if expDate != nil {
		fields.ExpiryDate = *expDate
	}
	elementString, err := services.BuildGS1ElementString(fields)
	if err != nil {
		return c.Status(422).JSON(fiber.Map{"error": err.Error()})
	}

	resp := gs1DataResp{
		TokenID:         tokenID,
		GTIN:            *gtin,
		Lot:             lot,
		Serial:          *gs1Serial,
		ManufactureDate: mfgDate.Format("2006-01-02"),
		ElementString:   elementString,
		ProductCode:     productCode,
		Spec:            spec,
		Unit:            unit,
		OriginCountry:   originCountry,
		Manufacturer:    importerComp,
	}
	if productName != nil {
		resp.ProductName = *productName
	}
	if expDate != nil {
		s := expDate.Format("2006-01-02")
		resp.ExpiryDate = &s
	}
	return c.JSON(resp)
}
