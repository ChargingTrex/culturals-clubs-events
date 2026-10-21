from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """
    API_Standards §3.5. Default 25, maximum 200, and a request above the
    maximum is clamped rather than rejected — which is what PageNumberPagination
    already does with max_page_size, so the behaviour is stated not reimplemented.
    """

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 200
