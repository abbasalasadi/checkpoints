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

func hasPrefixAt(s, prefix string, at int) bool {
	if at+len(prefix) > len(s) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		if s[at+i] != prefix[i] {
			return false
		}
	}
	return true
}

func main() {
	args := os.Args[1:]
	if len(args) != 3 {
		return
	}
	s, search, replace := args[0], args[1], args[2]
	if search == "" {
		printStr(s)
		z01.PrintRune('\n')
		return
	}
	res := ""
	for i := 0; i < len(s); {
		if hasPrefixAt(s, search, i) {
			res += replace
			i += len(search)
			continue
		}
		res += s[i : i+1]
		i++
	}
	printStr(res)
	z01.PrintRune('\n')
}
