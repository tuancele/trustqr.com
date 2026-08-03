package services

import "crypto/rand"

const voucherAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // exclude I,O,0,1

// GenerateVoucher returns a code like "YHH-A7K2P9".
func GenerateVoucher() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, 6)
	for i, v := range b {
		out[i] = voucherAlphabet[int(v)%len(voucherAlphabet)]
	}
	return "YHH-" + string(out), nil
}
