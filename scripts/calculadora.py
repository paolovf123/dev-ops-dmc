def suma(a, b):
    return a + b


def resta(a, b):
    return a - b


def multiplicacion(a, b):
    return a * b


def division(a, b):
    if b == 0:
        return "Error: división entre cero"
    return a / b


if __name__ == "__main__":
    print("=== Calculadora ===")
    num1 = float(input("Primer número: "))
    num2 = float(input("Segundo número: "))
    print(f"Suma: {suma(num1, num2)}")
    print(f"Resta: {resta(num1, num2)}")
    print(f"Multiplicación: {multiplicacion(num1, num2)}")
    print(f"División: {division(num1, num2)}")
