package piscine

func ItoaBase(value, base int) string {
	if base < 2 || base > 16 {
		return ""
	}
	if value == 0 {
		return "0"
	}
	const digits = "0123456789ABCDEF"
	neg := value < 0
	res := ""
	for value != 0 {
		d := value % base
		if d < 0 {
			d = -d
		}
		res = digits[d:d+1] + res
		value /= base
	}
	if neg {
		return "-" + res
	}
	return res
}
