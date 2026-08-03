package services

import (
	"fmt"
	"log"
	"os"
)

// SMSSender is the pluggable interface for SMS/Zalo providers.
// Swap the implementation (esms, vietguys, twilio, zns...) without changing handlers.
type SMSSender interface {
	Send(phone, message string) error
}

// StubSMS logs messages to stdout - use in local dev.
type StubSMS struct{}

func (s *StubSMS) Send(phone, message string) error {
	log.Printf("[SMS STUB] to=%s msg=%q", phone, message)
	return nil
}

// FileSMS writes to a log file for review during dev.
type FileSMS struct {
	path string
}

func NewFileSMS(path string) *FileSMS { return &FileSMS{path: path} }

func (f *FileSMS) Send(phone, message string) error {
	fp, err := os.OpenFile(f.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer fp.Close()
	_, err = fmt.Fprintf(fp, "%s\t%s\n", phone, message)
	return err
}

// NewSMSSender picks an implementation based on env config.
// In production, replace StubSMS with a real provider (eSMS.vn, VietGuys, Zalo ZNS...).
func NewSMSSender(kind string) SMSSender {
	switch kind {
	case "file":
		return NewFileSMS("./sms.log")
	default:
		return &StubSMS{}
	}
}
