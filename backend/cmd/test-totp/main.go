package main

import (
	"fmt"
	"os"
	"time"

	"github.com/pquerna/otp/totp"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: test-totp <secret>")
		os.Exit(1)
	}
	code, err := totp.GenerateCode(os.Args[1], time.Now())
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(code)
}
