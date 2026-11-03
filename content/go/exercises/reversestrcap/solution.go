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

func toUpper(r rune) rune {
	if r >= 'a' && r <= 'z' {
		return r - ('a' - 'A')
	}
	return r
}

func toLower(r rune) rune {
	if r >= 'A' && r <= 'Z' {
		return r + ('a' - 'A')
	}
	return r
}

func main() {
	for _, arg := range os.Args[1:] {
		runes := []rune(arg)
		for j, r := range runes {
			if j+1 == len(runes) || runes[j+1] == ' ' {
				runes[j] = toUpper(r)
			} else {
				runes[j] = toLower(r)
			}
		}
		printStr(string(runes))
		z01.PrintRune('\n')
	}
}
