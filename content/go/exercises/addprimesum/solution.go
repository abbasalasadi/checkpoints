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

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	res := ""
	for n != 0 {
		d := n % 10
		if d < 0 {
			d = -d
		}
		res = string(rune('0'+d)) + res
		n /= 10
	}
	if neg {
		return "-" + res
	}
	return res
}

func atoi(s string) int {
	i := 0
	sign := 1
	if len(s) > 0 && (s[0] == '-' || s[0] == '+') {
		if s[0] == '-' {
			sign = -1
		}
		i++
	}
	if i == len(s) {
		return 0
	}
	n := 0
	for ; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0
		}
		n = n*10 + int(s[i]-'0')
	}
	return sign * n
}

func isPrime(nb int) bool {
	if nb < 2 {
		return false
	}
	for i := 2; i*i <= nb; i++ {
		if nb%i == 0 {
			return false
		}
	}
	return true
}

func main() {
	if len(os.Args) != 2 {
		printStr("0\n")
		return
	}
	argument := atoi(os.Args[1])
	if argument < 0 {
		printStr("0\n")
		return
	}
	result := 0
	for ; argument >= 0; argument-- {
		if isPrime(argument) {
			result += argument
		}
	}
	printStr(itoa(result))
	z01.PrintRune('\n')
}
