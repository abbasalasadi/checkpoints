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

func contains(rs []rune, r rune) bool {
	for _, v := range rs {
		if v == r {
			return true
		}
	}
	return false
}

func result(s1 string, s2 string) string {
	var rest []rune
	for _, a := range s1 {
		for _, b := range s2 {
			if a == b && !contains(rest, a) {
				rest = append(rest, a)
			}
		}
	}
	return string(rest)
}

func main() {
	if len(os.Args) == 3 {
		printStr(result(os.Args[1], os.Args[2]))
		z01.PrintRune('\n')
	}
}
