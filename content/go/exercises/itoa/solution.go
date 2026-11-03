package piscine

func Itoa(n int) string {
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
