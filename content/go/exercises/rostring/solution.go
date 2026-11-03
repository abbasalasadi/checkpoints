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

func deleteExtraSpaces(a []string) []string {
	var res []string
	for _, v := range a {
		if v != "" {
			res = append(res, v)
		}
	}
	return res
}

func main() {
	if len(os.Args) == 2 {
		words := deleteExtraSpaces(split(os.Args[1], ' '))
		if len(words) >= 1 {
			for _, v := range words[1:] {
				printStr(v)
				z01.PrintRune(' ')
			}
			printStr(words[0])
		}
	}
	z01.PrintRune('\n')
}
