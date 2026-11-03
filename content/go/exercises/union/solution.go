package main

import (
	"os"

	"github.com/01-edu/z01"
)

func printStr(s string) {
	for _, r := range s {
		z01.PrintRune(r)
	}
}

func contains(s string, r rune) bool {
	for _, v := range s {
		if v == r {
			return true
		}
	}
	return false
}

func main() {
	if len(os.Args) == 3 {
		var res string
		for _, v := range os.Args[1] {
			if !contains(res, v) {
				res += string(v)
			}
		}
		for _, v := range os.Args[2] {
			if !contains(res, v) {
				res += string(v)
			}
		}
		printStr(res)
	}
	z01.PrintRune('\n')
}
