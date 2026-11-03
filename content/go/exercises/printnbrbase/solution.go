package piscine

import "github.com/01-edu/z01"

func PrintNbrBase(nbr int, base string) {
	if !validBase(base) {
		z01.PrintRune('N')
		z01.PrintRune('V')
		return
	}

	b := len(base)
	if nbr < 0 {
		z01.PrintRune('-')
	} else {
		nbr = -nbr
	}

	var digits []byte
	for {
		digits = append(digits, base[-(nbr%b)])
		nbr /= b
		if nbr == 0 {
			break
		}
	}
	for i := len(digits) - 1; i >= 0; i-- {
		z01.PrintRune(rune(digits[i]))
	}
}

func validBase(base string) bool {
	if len(base) < 2 {
		return false
	}
	seen := map[byte]bool{}
	for i := 0; i < len(base); i++ {
		c := base[i]
		if c == '+' || c == '-' || seen[c] {
			return false
		}
		seen[c] = true
	}
	return true
}
