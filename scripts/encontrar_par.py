def es_par(n):
    return n % 2 == 0


if __name__ == "__main__":
    num = int(input("Ingrese un número: "))
    if es_par(num):
        print(f"{num} es par")
    else:
        print(f"{num} es impar")
