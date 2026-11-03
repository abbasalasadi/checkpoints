package main

import (
	"fmt"
	"os"
)

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

func containsByte(s string, b byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return true
		}
	}
	return false
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func isLetter(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

func singleSearch(exp []string, text string) []string {
	items := split(text, ' ')
	var result []string

	for _, item := range items {
		for _, word := range exp {
			if contains(item, word) {
				result = append(result, item)
			}
		}
	}
	return result
}

func simpleSearch(runes []rune, text string) []string {
	exp := string(runes)

	var result []string
	if !containsByte(exp, '|') {
		result = singleSearch([]string{exp}, text)
	} else {
		result = append(result, singleSearch(split(exp, '|'), text)...)
	}
	return result
}

func brackets(regexp, text string) {
	if text == "" || regexp == "" {
		return
	}
	runes := []rune(regexp)

	if runes[0] == '(' && runes[len(runes)-1] == ')' {
		runes = runes[1 : len(runes)-1]
		result := simpleSearch(runes, text)
		for i, s := range result {
			if !isLetter(rune(s[len(s)-1])) {
				s = s[0 : len(s)-1]
			}
			fmt.Printf("%d: %s\n", i+1, s)
		}
	}
}

func main() {
	if len(os.Args) == 3 {
		brackets(os.Args[1], os.Args[2])
	}
}
