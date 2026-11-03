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

func indexVowel(s string) int {
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case 'a', 'e', 'i', 'o', 'u', 'A', 'E', 'I', 'O', 'U':
			return i
		}
	}
	return -1
}

func main() {
	if len(os.Args) != 2 || os.Args[1] == "" {
		return
	}
	s := os.Args[1]
	vowel := indexVowel(s)
	if vowel == -1 {
		printStr("No vowels")
	} else {
		printStr(s[vowel:] + s[:vowel] + "ay")
	}
	z01.PrintRune('\n')
}
