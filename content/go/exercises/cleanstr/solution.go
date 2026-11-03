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

func isSpace(b byte) bool {
	return b == ' ' || b == '\t'
}

func main() {
	args := os.Args[1:]
	if len(args) != 1 {
		z01.PrintRune('\n')
		return
	}
	s := args[0]
	first := true
	for i := 0; i < len(s); {
		for i < len(s) && isSpace(s[i]) {
			i++
		}
		start := i
		for i < len(s) && !isSpace(s[i]) {
			i++
		}
		if start == i {
			break
		}
		if !first {
			z01.PrintRune(' ')
		}
		first = false
		printStr(s[start:i])
	}
	z01.PrintRune('\n')
}
