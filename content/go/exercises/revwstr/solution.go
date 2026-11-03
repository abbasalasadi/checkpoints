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

func split(s string, sep byte) []string {
	var res []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			res = append(res, s[start:i])
			start = i + 1
		}
	}
	return append(res, s[start:])
}

func main() {
	if len(os.Args) == 2 {
		a := split(os.Args[1], ' ')
		for i := len(a) - 1; i >= 0; i-- {
			printStr(a[i])
			if i != 0 {
				z01.PrintRune(' ')
			}
		}
		z01.PrintRune('\n')
	}
}
