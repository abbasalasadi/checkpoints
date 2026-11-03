package main

import (
	"os"

	"github.com/01-edu/z01"
)

func indexRune(s string, r rune) int {
	for i, v := range s {
		if v == r {
			return i
		}
	}
	return -1
}

func main() {
	if len(os.Args) != 3 {
		return
	}
	i := 0
	for _, r := range os.Args[1] {
		j := indexRune(os.Args[2][i:], r)
		if j == -1 {
			z01.PrintRune('0')
			z01.PrintRune('\n')
			return
		}
		i += j + 1
	}
	z01.PrintRune('1')
	z01.PrintRune('\n')
}
