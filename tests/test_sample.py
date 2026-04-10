def suma(a, b):
    return a + b


def es_par(n):
    return n % 2 == 0


def invertir_texto(texto):
    return texto[::-1]


class TestSuma:
    def test_suma_positivos(self):
        assert suma(2, 3) == 5

    def test_suma_negativos(self):
        assert suma(-1, -1) == -2

    def test_suma_con_cero(self):
        assert suma(5, 0) == 5


class TestEsPar:
    def test_par(self):
        assert es_par(4) is True

    def test_impar(self):
        assert es_par(7) is False

    def test_cero_es_par(self):
        assert es_par(0) is True


class TestInvertirTexto:
    def test_palabra(self):
        assert invertir_texto("hola") == "aloh"

    def test_vacio(self):
        assert invertir_texto("") == ""

    def test_palindromo(self):
        assert invertir_texto("aba") == "aba"
